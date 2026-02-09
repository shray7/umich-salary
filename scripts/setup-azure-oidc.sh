#!/usr/bin/env bash
# One-time setup: Create Azure AD app with federated credential for GitHub Actions OIDC,
# then grant the app's service principal AcrPush on ACR and Contributor on the resource group.
#
# Usage: ./scripts/setup-azure-oidc.sh
# Optional: GITHUB_REPO=owner/repo (default: from git remote), or set ACR_NAME, RESOURCE_GROUP.
#
# Prereqs: az login, and deploy-azure.env (or set ACR_NAME, RESOURCE_GROUP).
# After running, add the printed secrets to GitHub repo → Settings → Secrets and variables → Actions.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [[ -f "$SCRIPT_DIR/deploy-azure.env" ]]; then
  set -a
  source "$SCRIPT_DIR/deploy-azure.env"
  set +a
fi

# Repo in form owner/repo for OIDC subject (e.g. shray7/umich-salary)
GITHUB_REPO="${GITHUB_REPO:-}"
if [[ -z "$GITHUB_REPO" ]]; then
  REMOTE=$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null || true)
  if [[ "$REMOTE" =~ github\.com[:/]([^/]+)/([^/.]+) ]]; then
    GITHUB_REPO="${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
  fi
fi
if [[ -z "$GITHUB_REPO" ]]; then
  echo "Set GITHUB_REPO=owner/repo or run from a repo with origin pointing at GitHub."
  exit 1
fi

RESOURCE_GROUP="${RESOURCE_GROUP:-rg-umich-salary}"
ACR_NAME="${ACR_NAME:?Set ACR_NAME (e.g. in deploy-azure.env)}"
APP_NAME="${APP_NAME:-umich-salary-github-actions}"

echo "=== Using repo: $GITHUB_REPO, resource group: $RESOURCE_GROUP, ACR: $ACR_NAME ==="
az account show -o none || { echo "Run 'az login' first."; exit 1; }

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

echo "=== Creating app registration: $APP_NAME ==="
APP_ID=$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)
echo "App ID: $APP_ID"

echo "=== Adding federated credential for GitHub (main branch) ==="
az ad app federated-credential create \
  --id "$APP_ID" \
  --parameters "{\"name\":\"main\",\"issuer\":\"https://token.actions.githubusercontent.com\",\"subject\":\"repo:${GITHUB_REPO}:ref:refs/heads/main\",\"audiences\":[\"api://AzureADTokenExchange\"]}" \
  -o none

echo "=== Creating service principal ==="
SP_ID=$(az ad sp create --id "$APP_ID" --query id -o tsv)
echo "Service principal ID: $SP_ID"

echo "=== Waiting for SP to propagate ==="
sleep 15

echo "=== Granting AcrPush on ACR ==="
ACR_ID=$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query id -o tsv)
az role assignment create --assignee "$APP_ID" --role AcrPush --scope "$ACR_ID" -o none

echo "=== Granting Contributor on resource group ==="
RG_ID="/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}"
az role assignment create --assignee "$APP_ID" --role Contributor --scope "$RG_ID" -o none

echo ""
echo "=== Done. Add these GitHub secrets (Settings → Secrets and variables → Actions) ==="
echo ""
echo "  AZURE_CLIENT_ID       = $APP_ID"
echo "  AZURE_TENANT_ID       = $TENANT_ID"
echo "  AZURE_SUBSCRIPTION_ID = $SUBSCRIPTION_ID"
echo "  ACR_NAME              = $ACR_NAME"
echo "  RESOURCE_GROUP        = $RESOURCE_GROUP   (optional; workflow defaults to rg-umich-salary)"
echo ""
