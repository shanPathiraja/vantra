# Vantra

Fleet telemetry backend. NestJS + MongoDB.

## Setup

### Local (no Docker)
1. `npm install`
2. Copy `.env.example` to `.env`
3. `npm run seed` to populate local MongoDB with historical fleet data
4. `npm run start:dev`

### Docker
1. `docker-compose up`
2. `npm run seed` (against the compose Mongo instance) once containers are up

## Scripts

- `npm run start:dev` - run the API locally with hot reload
- `npm run seed` - populate MongoDB with historical fleet + telemetry data (local dev only, destructive)
- `npm run migrate:tenants` - safe, non-destructive multi-tenant backfill migration (production & staging)
  - **WARNING:** Always take a full database backup (`mongodump`) before executing migrations against a production or staging database.
  - Recommended: test with `npm run migrate:tenants -- --dry-run` first to preview changes.
- `npm test` - run the test suite
- `npm run typecheck` - type-check without emitting

## Known issues

This has grown organically over the past several months and hasn't had a
dedicated cleanup pass. If something in local dev doesn't come up cleanly
on the first try, it's likely not you - check logs before assuming your
environment is misconfigured.
