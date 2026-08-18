# Hub API — production client configuration

After `npm run deploy:api`, note the **HubApiUrl** stack output (API Gateway HTTP API endpoint).

## Browser configuration (GitHub Pages Hub)

**Settings → Hub API** (`#/settings/hub-api`): set the API base URL, then **Sign in** as Rayenz (or an invitee). Tokens stay in sessionStorage.

DevTools equivalent (URL only — sign-in still required):

```javascript
localStorage.setItem('rayenz-hub-api-url', 'https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com');
```

Reload the page. API mode is on only when that URL is set **and** a login session exists.

### Disable API mode

Use **Clear** on the Hub API settings tab, or:

```javascript
localStorage.removeItem('rayenz-hub-api-url');
```

The Hub continues to work with `localStorage` only (no API URL required).

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
npx tsx scripts/migrate-user-partition.ts --execute --target-sub <cognito-sub>
# After verification:
npx tsx scripts/migrate-user-partition.ts --execute --target-sub <cognito-sub> --delete-bootstrap
```

See `docs/hub-api-production.md` in the source repo for the full cutover order.
