# Deploying to Azure

This guide covers running **PostgreSQL** on Azure and the **backend** as a Docker container.

## Overview

| Component | Azure service | Why |
|-----------|---------------|-----|
| Database | **Azure Database for PostgreSQL - Flexible Server** | Managed, backups, no VM to maintain |
| Backend API | **Azure Container Apps** (or App Service) | Runs your Docker image, scales, easy env/config |

You keep the frontend wherever you host static sites (Vite build → e.g. Azure Static Web Apps, or any CDN).

---

## 1. Azure PostgreSQL (Flexible Server)

1. **Create a Flexible Server** (Azure Portal or CLI):
   - **Region:** same as your backend (e.g. East US).
   - **Version:** 16 (or 15).
   - **Compute + storage:** smallest tier is fine to start (e.g. Burstable B1ms).
   - **Authentication:** PostgreSQL authentication (password); set an **admin username** and **password** (store these safely).

2. **Networking:**
   - Allow Azure services (and optionally your IP for debugging).
   - For Container Apps, enable **public access** or put both in a VNet and allow private access.

3. **Create the database:**
   - In the server, create a database named `umich_salary` (or use the default `postgres` and create it via `createdb` / query).

4. **Connection string:**
   ```text
   postgresql://<admin-user>:<password>@<server-name>.postgres.database.azure.com:5432/umich_salary?sslmode=require
   ```
   Use this as `DATABASE_URL` for the backend. Azure Postgres requires SSL; `sslmode=require` in the URL is usually enough for the Node `pg` client.

---

## 2. Backend Docker image

Your backend is already containerized. Build and push to **Azure Container Registry (ACR)** so Container Apps can pull it.

```bash
# Create a resource group and ACR (one-time)
az group create --name rg-umich-salary --location eastus
az acr create --resource-group rg-umich-salary --name youracrname --sku Basic

# Log in and build/push from repo root
az acr login --name youracrname
docker build -t youracrname.azurecr.io/umich-salary-backend:latest ./backend
docker push youracrname.azurecr.io/umich-salary-backend:latest
```

Use your own ACR name (globally unique). For production, tag with versions instead of only `latest`.

---

## 3. Azure Container Apps (backend API)

1. **Create a Container App environment** (if you don’t have one):
   ```bash
   az containerapp env create \
     --name caenv-umich-salary \
     --resource-group rg-umich-salary \
     --location eastus
   ```

2. **Create the Container App** (backend):
   ```bash
   az containerapp create \
     --name ca-umich-salary-api \
     --resource-group rg-umich-salary \
     --environment caenv-umich-salary \
     --image youracrname.azurecr.io/umich-salary-backend:latest \
     --registry-server youracrname.azurecr.io \
     --registry-username <acr-username> \
     --registry-password <acr-password> \
     --target-port 3000 \
     --ingress external \
     --min-replicas 0 \
     --max-replicas 2 \
     --env-vars "PORT=3000" "DATABASE_URL=postgresql://..."
   ```

   - Replace `youracrname`, ACR credentials, and `DATABASE_URL` with your Azure Postgres connection string.
   - **Secrets:** put `DATABASE_URL` in a Container App secret or Azure Key Vault and reference it instead of plain env (recommended for production).

3. **Schema init:** Your `docker-entrypoint.sh` runs `node src/db/init.js` on startup. The first time the container starts against Azure Postgres, it will create tables. No extra step needed.

4. **Optional seed data:** To load sample data once, run a one-off job or temporary container with `RUN_SEED=1` and the same `DATABASE_URL`, or run `node src/db/seed.js` from your machine against the Azure DB (with IP allowed).

---

## 4. App Service (alternative to Container Apps)

If you prefer **App Service** instead of Container Apps:

1. Create a **Web App for Containers** (Linux).
2. Set the image to `youracrname.azurecr.io/umich-salary-backend:latest` and configure ACR in the app’s Deployment Center.
3. In **Configuration → Application settings**, add:
   - `DATABASE_URL` = your Azure Postgres connection string
   - `PORT` = 3000 (or leave default; App Service sets PORT for you)
4. Startup: your Dockerfile’s entrypoint already runs DB init then the Node server; no change needed.

---

## 5. Multi-region (West US + East US)

For low latency in both West US and East US, deploy the backend in both regions and put Azure Front Door in front.

### Prerequisites (for script or manual deploy)

- **PostgreSQL resource provider:** If you see `The subscription is not registered to use namespace 'Microsoft.DBforPostgreSQL'`, run:
  ```bash
  az provider register --namespace Microsoft.DBforPostgreSQL
  ```
  Registration can take a few minutes. Check with `az provider show --namespace Microsoft.DBforPostgreSQL --query registrationState -o tsv` until it shows `Registered`.

- **Region restrictions:** Some subscriptions restrict Flexible Server in certain regions (e.g. East US). If create fails with "location is restricted", use another region (e.g. `westus`) by setting `LOCATION_EAST=westus` in your deploy env, or create the server manually in an allowed region and point the script’s `POSTGRES_SERVER_NAME` at it. Use one PostgreSQL primary plus an optional read replica so each region's backend talks to a database in the same region.

### Architecture

- **Database:** One Azure PostgreSQL Flexible Server **primary** (e.g. East US). Optionally add a **read replica** in West US ([Flexible Server read replicas](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-read-replicas)). The replica has its own hostname; use it only for reads.
- **Backend:** Same Docker image in two Container Apps (or App Services): one in East US, one in West US. No code changes; only `DATABASE_URL` differs per region.
- **Traffic:** Azure Front Door with an origin group containing both backends and **latency-based** (or geo) routing so users hit the nearest region.

### Database: primary + read replica

1. **Primary:** Create the Flexible Server in one region (e.g. **East US**). Create database `umich_salary`, run schema init and any seed/imports once against the primary.
2. **Read replica (West US):** In the Azure Portal (or CLI), add a read replica in **West US**. The replica gets a separate hostname (e.g. `your-server-replica.postgres.database.azure.com`).
3. **Connection strings:**
   - **East US backend:** `DATABASE_URL` = primary connection string.
   - **West US backend:** `DATABASE_URL` = replica connection string (same format as primary, but replica hostname; include `?sslmode=require`).

Schema init and any admin writes (migrations, re-imports) must run against the **primary** only. The West US backend is read-only against the replica; replication propagates DDL from the primary to the replica.

### Deploy backend in both regions

1. **Build once:** Build and push the same image to ACR (see section 2). Use one ACR (e.g. in East US) or geo-replicated ACR if you prefer.
2. **East US:** Deploy a Container App (or App Service) in **East US** with the image and env:
   - `PORT=3000`
   - `DATABASE_URL=<primary-connection-string>`
   - Run schema init once here (or via a one-off job against the primary). The entrypoint runs `node src/db/init.js` on startup; that is fine for the primary.
3. **West US:** Deploy a second Container App (or App Service) in **West US** with the same image and env:
   - `PORT=3000`
   - `DATABASE_URL=<replica-connection-string>`
   - Do **not** rely on init on the replica (replicas are read-only). Ensure schema has already been applied on the primary before directing traffic to the West US backend.

Use Container App secrets or Key Vault for `DATABASE_URL` in both apps.

### Azure Front Door (global routing)

1. Create an **Azure Front Door** (Standard or Premium) profile.
2. Add an **origin group** with two origins:
   - Origin 1: East US backend (your East US Container App or App Service URL).
   - Origin 2: West US backend URL.
3. Configure **routing** to use **latency-based** (or geo-based) routing so each user is sent to the nearest origin. Enable health probes so a failed region is taken out of rotation.
4. Front Door gives you one public hostname (e.g. `https://yourapp.azurefd.net`). Use this as the API base URL in your frontend so all traffic goes through Front Door to the nearest backend.

### Optional: single database (no replica)

If you want the simplest setup first:

- Use a **single** PostgreSQL primary (e.g. East US). Deploy the backend in **both** West US and East US; **both** use the same primary `DATABASE_URL`. Front Door still routes users to the nearest backend, but the West US backend will have cross-region latency to the database. You can add a read replica later and switch the West US backend to the replica connection string.

---

## 6. Security checklist

- **Never commit** `DATABASE_URL` or passwords. Use `.env` locally (gitignored) and Azure env vars / Key Vault in the cloud.
- **Postgres:** Use a strong password; restrict firewall to your app’s outbound IPs or VNet.
- **Backend:** Put `DATABASE_URL` in Container App/App Service **secrets** or Key Vault reference.
- **HTTPS:** Container Apps and App Service provide HTTPS; point your frontend to the backend URL.

---

## 7. Frontend

Build the frontend and point its API base URL to your deployed backend:

```bash
cd frontend
npm run build
```

Set `VITE_API_URL` to your backend root (e.g. `https://ca-umich-salary-api.xxx.azurecontainerapps.io`) before building, or configure your hosting to inject the API URL. Deploy the `dist/` output to **Azure Static Web Apps**, Blob + CDN, or any static host.

---

## 8. Deploy from GitHub Actions

The backend workflow (`.github/workflows/backend.yml`) can deploy to Azure on every push to `main`: it runs CI, then builds the Docker image, pushes to ACR, and updates both Container Apps.

**One-time setup:**

1. **Azure AD app and federated credential**  
   In Azure Portal → Microsoft Entra ID → App registrations → New registration.  
   Then: Certificates & secrets → Federated credentials → Add:  
   - **Issuer:** `https://token.actions.githubusercontent.com`  
   - **Subject:** `repo:<your-org>/<your-repo>:ref:refs/heads/main`  
   - **Audience:** `api://AzureADTokenExchange`

2. **RBAC for the app’s service principal**  
   Grant the app (Enterprise application / service principal):  
   - **AcrPush** on your Azure Container Registry  
   - **Contributor** on the resource group (or at least the Container Apps)

3. **GitHub secrets** (repo → Settings → Secrets and variables → Actions):  
   - `AZURE_CLIENT_ID` – Application (client) ID of the app  
   - `AZURE_TENANT_ID` – Directory (tenant) ID  
   - `AZURE_SUBSCRIPTION_ID` – Subscription ID  
   - `ACR_NAME` – Your ACR name (e.g. `umichsalaryf06715`)  
   - `RESOURCE_GROUP` (optional) – Default is `rg-umich-salary`

After this, pushes to `main` that touch `backend/` will run CI and then deploy the new image to both East and West Container Apps.

---

## Quick reference (CLI)

```bash
# PostgreSQL connection string (Azure)
postgresql://USER:PASSWORD@SERVER.postgres.database.azure.com:5432/umich_salary?sslmode=require

# Backend URL (after deploy)
https://<your-container-app>.azurecontainerapps.io
```

Use this backend URL (and optional path prefix if you add one) as the API base for the frontend.
