# Hub API — production client configuration

After `npm run deploy:api`, note the **HubApiUrl** stack output (API Gateway HTTP API endpoint). `npm run publish:hub` bakes that URL into the SPA (`VITE_HUB_API_URL`, or `HUB_API_URL`, or the stack output).

## Browser configuration (GitHub Pages Hub)

**Settings → Hub API** (`#/settings/hub-api`): **Sign in** as Rayenz (or an invitee). Tokens stay in sessionStorage. The API URL is part of the Pages bundle — do not set it in localStorage.

API mode is on only when the baked URL is present **and** a login session exists.

### Disable API mode

Use **Sign out** on the Hub API settings tab. The Hub continues to work with `localStorage` only.

## Verify deployed API

```powershell
cd C:\DeepStorage\Documents\Workspaces\Hub\rayenz-hub
$env:HUB_API_URL = "https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com"
$env:HUB_USERNAME = "Rayenz"
$env:HUB_PASSWORD = "<cognito-password>"
npm run test:api:deployed
```

## Partition migration

```powershell
npx tsx scripts/migrate-user-partition.ts --dry-run
```
