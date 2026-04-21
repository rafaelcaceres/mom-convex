# [M0-T07] convex/http.ts esqueleto + /health endpoint

## Why
Futuras tasks (Slack events, OAuth callbacks) vão adicionar rotas em `http.ts`. Criar a spine + um endpoint trivial valida o fluxo e expõe `CONVEX_SITE_URL` pra docs de setup.

## Depends on
[M0-T01] scaffold, [M0-T02] auth (pra registrar auth routes)

## Acceptance tests (write FIRST)
- `convex/http.test.ts`
  - `GET /health` retorna `200 { ok: true, commit: <sha|"dev"> }`
  - `GET /unknown` retorna `404`
  - CORS configurado pra origin `process.env.SITE_URL` (Next.js)

## Implementation
- `convex/http.ts` — `httpRouter()`, `http.route({path:"/health",method:"GET",handler:healthAction})`, registra `auth.addHttpRoutes(http)`
- `convex/_shared/adapters/health.httpAction.ts` — lê `process.env.CONVEX_GIT_COMMIT_HASH || "dev"`, retorna JSON
- Smoke script `scripts/check-health.mjs` — `fetch($CONVEX_SITE_URL/health)` e valida

## Done when
- `curl $CONVEX_SITE_URL/health` retorna JSON
- `pnpm check:health` verde em CI staging step (opcional)
- README documenta: "OAuth redirects usam `$CONVEX_SITE_URL/<path>` — pegue essa URL em `pnpm convex dashboard` → Settings"

## References
- [Convex httpActions](https://docs.convex.dev/functions/http-actions)
- [Plano §Slack transport](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
