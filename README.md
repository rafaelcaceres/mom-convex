# mom-convex

Multi-tenant SaaS version of [pi-mom](docs/pi-mono/packages/mom/) built on Convex + Next.js.

See [TASKS.md](TASKS.md) for milestone progress and [tasks/](tasks/README.md) for the detailed backlog.

## Quick start

```bash
pnpm install

# First time: authenticate Convex and generate convex/_generated/
pnpm dev:convex

# Run Next + Convex together
pnpm dev
```

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Next.js + Convex in parallel |
| `pnpm dev:next` | Next.js only |
| `pnpm dev:convex` | Convex dev deployment |
| `pnpm build` | Next production build |
| `pnpm lint` | Biome check |
| `pnpm lint:fix` | Biome auto-fix |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest (unit + convex-test) |
| `pnpm test:smoke` | Smoke suites per milestone |
| `pnpm test:e2e` | Playwright end-to-end |

## Environment

Copy `.env.example` to `.env.local` and fill as each milestone requires. Most vars are unused until their milestone — see the inline section headers.

**`CONVEX_SITE_URL`** is the public HTTPS URL of your Convex deployment's httpActions (`https://<deployment>.convex.site`). OAuth redirects in Slack/Gmail/Notion use that URL directly — no ngrok needed.

## Layout

```
app/            Next.js 15 App Router (UI)
convex/         Convex backend (DDD domains — see convex-ddd-architecture skill)
tasks/          Backlog per milestone
test/           Cross-domain integration + smoke suites
```

## Architecture reference

- [docs/quero-explorar-mais-o-wild-papert.md](docs/quero-explorar-mais-o-wild-papert.md) — full blueprint
- [docs/arquitetura.md](docs/arquitetura.md) — original pi-mom architecture
- [docs/new.md](docs/new.md) — multi-platform refactor plan
