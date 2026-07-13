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
| `pnpm test:isolation` | Cross-tenant isolation gate (see below) |
| `pnpm test:e2e` | Playwright end-to-end |

## Cross-tenant isolation gate

`test/smoke/rag-isolation.test.ts` is the one suite in this repo that is not
about correctness but about containment: it asserts that no org can retrieve
another org's memories or messages. It runs in CI as its own job
(`🔒 Cross-tenant isolation gate`).

**If it is red, do not merge — not even "just to unblock the branch".** A failure
here means retrieval is capable of handing one customer another customer's
private text through the model. Treat it as an incident, not a flaky test:

1. Do not "fix" the test to make it pass. The test asserts row ownership by
   reading `orgId` back off the stored document — if it says a row leaked, a row
   leaked.
2. Find which of the four defenses broke. In order of the request path:
   the `orgId` filter on `ctx.vectorSearch` (`convex/memory/actions/search.ts`),
   the tenant re-check during hydration (`MemoryRepository.listVisibleByIds`),
   the scope closed over at toolset-build time (`buildToolSet`), and the
   `agentThreadId` that confines history search to its own thread.
3. Get a second pair of eyes before merging the fix.

The suite is deliberately redundant with `memorySearch.test.ts`: that one pins
that retrieval *works*, this one pins that it cannot *leak*. Layers 1 and 2 are
each independently sufficient — removing either alone keeps the gate green — so
the gate is verified by removing **both**, which turns it red on 7 of 8 tests.
Keep it that way: if a refactor ever leaves only one layer standing, the gate
still passes and you have silently spent your safety margin.

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
