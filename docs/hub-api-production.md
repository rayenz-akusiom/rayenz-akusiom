# Hub API — production client configuration

After `npm run deploy:api`, note the **HubApiUrl** stack output (API Gateway HTTP API endpoint).

## Browser configuration (GitHub Pages Hub)

Open DevTools on the deployed Hub and run:

```javascript
localStorage.setItem('rayenz-hub-api-url', 'https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com');
localStorage.setItem('rayenz-hub-api-key', 'YOUR_API_KEY');
```

Reload the page. The vanilla Hub (`hub-api-client.js`) and React settings shell (`#/settings/dailies`) use these keys when present.

### Disable API mode

```javascript
localStorage.removeItem('rayenz-hub-api-url');
localStorage.removeItem('rayenz-hub-api-key');
```

The Hub continues to work with `localStorage` only (no API URL required).

## API key source

Production API keys are stored in **SSM Parameter Store** at `/rayenz-hub/prod/api-key` (SecureString). Retrieve for client setup:

```powershell
aws ssm get-parameter --name /rayenz-hub/prod/api-key --with-decryption --query Parameter.Value --output text
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
