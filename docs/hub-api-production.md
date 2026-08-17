# Hub API — production client configuration

After `npm run deploy:api`, note the **HubApiUrl** stack output (API Gateway HTTP API endpoint).

## Browser configuration (GitHub Pages Hub)

Prefer **Settings → Hub API** (`#/settings/hub-api`) in the Hub SPA, or open DevTools and run:

```javascript
localStorage.setItem('rayenz-hub-api-url', 'https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com');
localStorage.setItem('rayenz-hub-api-key', 'YOUR_API_KEY');
```

Reload the page. The Hub API client and settings shell use these keys when present.

### Disable API mode

Use **Clear** on the Hub API settings tab, or:

```javascript
localStorage.removeItem('rayenz-hub-api-url');
localStorage.removeItem('rayenz-hub-api-key');
```

The Hub continues to work with `localStorage` only (no API URL required).

## API key source

The operator API key is in **Secrets Manager** (`rayenz-hub/prod/api-key`). Retrieve for MCP / deployed contract tests — not for Pages localStorage:

```powershell
aws secretsmanager get-secret-value --secret-id rayenz-hub/prod/api-key --region us-east-1 --query SecretString --output text
```

Do not commit API keys to git or embed them in static Hub assets.

## Verify deployed API

```powershell
cd C:\DeepStorage\Documents\Workspaces\Hub\rayenz-hub
$env:HUB_API_URL = "https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com"
$env:HUB_API_KEY = "<from-ssm>"
npm run test:api:deployed
```

## Cognito cutover (future)

When JWT auth ships, run the partition migration script (dry-run first):

```powershell
npx tsx scripts/migrate-user-partition.ts --dry-run
npx tsx scripts/migrate-user-partition.ts --execute --target-sub <cognito-sub>
# After verification:
npx tsx scripts/migrate-user-partition.ts --execute --target-sub <cognito-sub> --delete-bootstrap
```

See `documents/specs/002-hub-backend-platform/contracts/dynamodb-entities.md` for migration access patterns.
