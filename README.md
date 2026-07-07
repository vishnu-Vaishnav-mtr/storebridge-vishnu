# StoreBridge

StoreBridge is a production-oriented WooCommerce/WordPress to Shopify migration platform. It includes a Next.js dashboard, Prisma/PostgreSQL data model, Redis/BullMQ worker, encrypted credential storage, real API adapter boundaries, demo data, checkpointed migration jobs, progress events and downloadable reports.

## Architecture

- `apps/web`: Next.js App Router dashboard and API route handlers.
- `apps/worker`: Node.js BullMQ migration worker.
- `packages/database`: Prisma schema, client and seed data.
- `packages/shared`: encryption, validation, redaction, URL safety and shared types.
- `packages/woo-adapter`, `packages/wordpress-adapter`, `packages/shopify-adapter`: real API adapters.
- `packages/migration-core`: dependency rules, dry-run logic, progress, retries, redirects and reports.

## Prerequisites

- Node.js 22+
- pnpm 9+
- Docker Desktop

Enable pnpm if needed:

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
```

## Environment

Copy `.env.example` to `.env` and fill the values. Generate a credential encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Required variables include:

- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_SECRET`
- `APP_URL`
- `CREDENTIAL_ENCRYPTION_KEY`
- `OBJECT_STORAGE_PROVIDER`
- `OBJECT_STORAGE_ENDPOINT`
- `OBJECT_STORAGE_REGION`
- `OBJECT_STORAGE_BUCKET`
- `OBJECT_STORAGE_ACCESS_KEY`
- `OBJECT_STORAGE_SECRET_KEY`
- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`
- `SHOPIFY_API_VERSION`
- `LOG_LEVEL`
- `DEMO_MODE`

Never use real merchant credentials in `.env`. Merchant store credentials are submitted through the dashboard and encrypted before database storage.

## Local Development

```bash
pnpm install
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
pnpm dev:worker
```

Demo login for local development:

- Email: `demo@storebridge.local`
- Password: `StoreBridgeDemo!123`

## Migration Workflow

1. Register or log in.
2. Add a WooCommerce source connection.
3. Optionally add WordPress REST credentials.
4. Add a Shopify destination connection using OAuth foundation or a custom app token.
5. Test both connections and review permissions.
6. Run a read-only source audit.
7. Select data and configure mappings.
8. Run a dry run.
9. Start migration through the worker queue.
10. Pause, resume or retry failed records.
11. Verify reconciliation before cutover.
12. Download audit, dry-run, migration, error, redirect and reconciliation reports.

## Creating WooCommerce API Keys

In WordPress admin, open WooCommerce settings, go to Advanced, then REST API. Create a key with read access for the source store. Paste the Consumer Key and Consumer Secret into StoreBridge. StoreBridge never modifies the WooCommerce source by default.

## Connecting WordPress REST API

WordPress content uses `/wp-json/wp/v2`. For private content or media checks, create a WordPress Application Password for a user with suitable read access and enter it in the source connection form.

## Connecting Shopify

OAuth support is scaffolded for production app configuration. For local development, create a Shopify custom app, grant Admin API scopes such as `write_products`, `write_customers`, `write_orders`, `write_content` and `write_files`, then paste the Admin API access token into the dashboard.

## Tests

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

The standard test suite uses adapter mocks and demo data. Live store credentials are not required for CI.

## Security Notes

- Credentials are encrypted with AES-256-GCM.
- Saved secrets are masked and never returned to the browser.
- Logs and errors redact tokens, consumer secrets and passwords.
- Store URLs are validated and private-network targets are blocked unless `ALLOW_PRIVATE_NETWORK_URLS=true`.
- Migration work runs in the background worker, never inside one long HTTP request.

## Platform Limitations

Some WooCommerce plugin data, customer passwords, shortcodes, theme design and complex coupon rules cannot be transferred exactly into Shopify. StoreBridge preserves the source snapshot or warning, reports the unsupported record and does not claim those values were migrated successfully.
