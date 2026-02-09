#!/usr/bin/env bash
# Two-region Azure deployment: PostgreSQL (East US, optional read replica West US),
# backend Container Apps in East US and West US, Azure Front Door.
# Requires: az, docker. Source deploy-azure.env or set required env vars.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [[ -f "$SCRIPT_DIR/deploy-azure.env" ]]; then
  set -a
  source "$SCRIPT_DIR/deploy-azure.env"
  set +a
fi

RESOURCE_GROUP="${RESOURCE_GROUP:-rg-umich-salary}"
LOCATION_EAST="${LOCATION_EAST:-eastus}"
LOCATION_WEST="${LOCATION_WEST:-westus}"
ACR_NAME="${ACR_NAME:?Set ACR_NAME (globally unique, alphanumeric only)}"
POSTGRES_SERVER_NAME="${POSTGRES_SERVER_NAME:?Set POSTGRES_SERVER_NAME}"
POSTGRES_ADMIN_USER="${POSTGRES_ADMIN_USER:?Set POSTGRES_ADMIN_USER}"
POSTGRES_ADMIN_PASSWORD="${POSTGRES_ADMIN_PASSWORD:?Set POSTGRES_ADMIN_PASSWORD}"
POSTGRES_SKU="${POSTGRES_SKU:-Standard_B1ms}"
AFD_PROFILE_NAME="${AFD_PROFILE_NAME:-umich-salary-fd}"
AFD_ENDPOINT_NAME="${AFD_ENDPOINT_NAME:-api}"
USE_READ_REPLICA="${USE_READ_REPLICA:-0}"

IMAGE_NAME="${ACR_NAME}.azurecr.io/umich-salary-backend:latest"
CA_ENV_EAST="caenv-umich-salary-east"
CA_ENV_WEST="caenv-umich-salary-west"
CA_APP_EAST="ca-umich-salary-api-east"
CA_APP_WEST="ca-umich-salary-api-west"

echo "=== Checking Azure login ==="
az account show -o none || { echo "Run 'az login' first."; exit 1; }

echo "=== Creating resource group: $RESOURCE_GROUP in $LOCATION_EAST ==="
az group create --name "$RESOURCE_GROUP" --location "$LOCATION_EAST" -o none

echo "=== Ensuring Microsoft.DBforPostgreSQL provider is registered ==="
az provider register --namespace Microsoft.DBforPostgreSQL --wait 2>/dev/null || true

echo "=== Creating ACR: $ACR_NAME ==="
az acr create --resource-group "$RESOURCE_GROUP" --name "$ACR_NAME" --sku Basic -o none 2>/dev/null || true
az acr update --name "$ACR_NAME" --admin-enabled true -o none
az acr login --name "$ACR_NAME"

echo "=== Creating PostgreSQL Flexible Server (primary): $POSTGRES_SERVER_NAME in $LOCATION_EAST ==="
if ! az postgres flexible-server show --resource-group "$RESOURCE_GROUP" --name "$POSTGRES_SERVER_NAME" -o none 2>/dev/null; then
  az postgres flexible-server create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$POSTGRES_SERVER_NAME" \
    --location "$LOCATION_EAST" \
    --admin-user "$POSTGRES_ADMIN_USER" \
    --admin-password "$POSTGRES_ADMIN_PASSWORD" \
    --sku-name "$POSTGRES_SKU" \
    --tier Burstable \
    --version 16 \
    --storage-size 32 \
    --public-access 0.0.0.0 \
    -o none
else
  echo "Server already exists, skipping create."
fi

echo "=== Creating database umich_salary ==="
if ! az postgres flexible-server db show --resource-group "$RESOURCE_GROUP" --server-name "$POSTGRES_SERVER_NAME" --database-name umich_salary -o none 2>/dev/null; then
  az postgres flexible-server db create \
    --resource-group "$RESOURCE_GROUP" \
    --server-name "$POSTGRES_SERVER_NAME" \
    --database-name umich_salary \
    -o none
else
  echo "Database already exists, skipping create."
fi

PRIMARY_HOST="${POSTGRES_SERVER_NAME}.postgres.database.azure.com"
DATABASE_URL_PRIMARY="postgresql://${POSTGRES_ADMIN_USER}:${POSTGRES_ADMIN_PASSWORD}@${PRIMARY_HOST}:5432/umich_salary?sslmode=require"

if [[ "$USE_READ_REPLICA" == "1" ]]; then
  echo "=== Creating read replica in $LOCATION_WEST ==="
  REPLICA_NAME="${POSTGRES_SERVER_NAME}-replica"
  az postgres flexible-server replica create \
    --resource-group "$RESOURCE_GROUP" \
    --replica-name "$REPLICA_NAME" \
    --source-server "$POSTGRES_SERVER_NAME" \
    -o none
  REPLICA_HOST="${REPLICA_NAME}.postgres.database.azure.com"
  DATABASE_URL_REPLICA="postgresql://${POSTGRES_ADMIN_USER}:${POSTGRES_ADMIN_PASSWORD}@${REPLICA_HOST}:5432/umich_salary?sslmode=require"
else
  DATABASE_URL_REPLICA="$DATABASE_URL_PRIMARY"
fi

echo "=== Building and pushing backend image (linux/amd64 for Azure) ==="
docker build --platform linux/amd64 -t "$IMAGE_NAME" "$REPO_ROOT/backend"
docker push "$IMAGE_NAME"

ACR_USER=$(az acr credential show -n "$ACR_NAME" -g "$RESOURCE_GROUP" --query username -o tsv)
ACR_PASS=$(az acr credential show -n "$ACR_NAME" -g "$RESOURCE_GROUP" --query "passwords[0].value" -o tsv)

echo "=== Creating Container App environment and app in $LOCATION_EAST ==="
az containerapp env create \
  --name "$CA_ENV_EAST" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION_EAST" \
  -o none 2>/dev/null || true

az containerapp create \
  --name "$CA_APP_EAST" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$CA_ENV_EAST" \
  --image "$IMAGE_NAME" \
  --registry-server "${ACR_NAME}.azurecr.io" \
  --registry-username "$ACR_USER" \
  --registry-password "$ACR_PASS" \
  --target-port 3000 \
  --ingress external \
  --min-replicas 0 \
  --max-replicas 2 \
  --env-vars "PORT=3000" "DATABASE_URL=secretref:database-url" "RATE_LIMIT_MAX=500" \
  --secrets "database-url=$DATABASE_URL_PRIMARY" \
  -o none

echo "=== Creating Container App environment and app in $LOCATION_WEST ==="
az containerapp env create \
  --name "$CA_ENV_WEST" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION_WEST" \
  -o none 2>/dev/null || true

az containerapp create \
  --name "$CA_APP_WEST" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$CA_ENV_WEST" \
  --image "$IMAGE_NAME" \
  --registry-server "${ACR_NAME}.azurecr.io" \
  --registry-username "$ACR_USER" \
  --registry-password "$ACR_PASS" \
  --target-port 3000 \
  --ingress external \
  --min-replicas 0 \
  --max-replicas 2 \
  --env-vars "PORT=3000" "DATABASE_URL=secretref:database-url" "RATE_LIMIT_MAX=500" \
  --secrets "database-url=$DATABASE_URL_REPLICA" \
  -o none

FQDN_EAST=$(az containerapp show --name "$CA_APP_EAST" --resource-group "$RESOURCE_GROUP" --query "properties.configuration.ingress.fqdn" -o tsv)
FQDN_WEST=$(az containerapp show --name "$CA_APP_WEST" --resource-group "$RESOURCE_GROUP" --query "properties.configuration.ingress.fqdn" -o tsv)

echo "=== Creating Azure Front Door profile and endpoint ==="
az afd profile create \
  --profile-name "$AFD_PROFILE_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --sku Standard_AzureFrontDoor \
  -o none 2>/dev/null || true

az afd endpoint create \
  --resource-group "$RESOURCE_GROUP" \
  --profile-name "$AFD_PROFILE_NAME" \
  --endpoint-name "$AFD_ENDPOINT_NAME" \
  --enabled-state Enabled \
  -o none 2>/dev/null || true

echo "=== Creating Front Door origin group (latency-based) and origins ==="
az afd origin-group create \
  --resource-group "$RESOURCE_GROUP" \
  --profile-name "$AFD_PROFILE_NAME" \
  --origin-group-name api-origin-group \
  --probe-request-type GET \
  --probe-protocol Https \
  --probe-interval-in-seconds 60 \
  --probe-path "/api/health" \
  --sample-size 4 \
  --successful-samples-required 3 \
  --additional-latency-in-milliseconds 50 \
  -o none 2>/dev/null || true

az afd origin create \
  --resource-group "$RESOURCE_GROUP" \
  --profile-name "$AFD_PROFILE_NAME" \
  --origin-group-name api-origin-group \
  --origin-name east \
  --host-name "$FQDN_EAST" \
  --origin-host-header "$FQDN_EAST" \
  --priority 1 \
  --weight 1000 \
  --enabled-state Enabled \
  --https-port 443 \
  -o none 2>/dev/null || true

az afd origin create \
  --resource-group "$RESOURCE_GROUP" \
  --profile-name "$AFD_PROFILE_NAME" \
  --origin-group-name api-origin-group \
  --origin-name west \
  --host-name "$FQDN_WEST" \
  --origin-host-header "$FQDN_WEST" \
  --priority 1 \
  --weight 1000 \
  --enabled-state Enabled \
  --https-port 443 \
  -o none 2>/dev/null || true

echo "=== Creating Front Door route ==="
az afd route create \
  --resource-group "$RESOURCE_GROUP" \
  --profile-name "$AFD_PROFILE_NAME" \
  --endpoint-name "$AFD_ENDPOINT_NAME" \
  --route-name api-route \
  --forwarding-protocol MatchRequest \
  --https-redirect Enabled \
  --origin-group api-origin-group \
  --supported-protocols Https \
  --link-to-default-domain Enabled \
  -o none 2>/dev/null || true

AFD_HOST=$(az afd endpoint show \
  --resource-group "$RESOURCE_GROUP" \
  --profile-name "$AFD_PROFILE_NAME" \
  --endpoint-name "$AFD_ENDPOINT_NAME" \
  --query "hostName" -o tsv)

echo ""
echo "=== Deployment complete ==="
echo "Front Door URL (use as API base in frontend): https://${AFD_HOST}"
echo "East US backend: https://${FQDN_EAST}"
echo "West US backend: https://${FQDN_WEST}"
echo "PostgreSQL primary: ${PRIMARY_HOST}"
echo ""
echo "Next: Run schema init against the primary (e.g. from a one-off container or your machine with DATABASE_URL). Then set VITE_API_URL=https://${AFD_HOST} and build/deploy the frontend."
