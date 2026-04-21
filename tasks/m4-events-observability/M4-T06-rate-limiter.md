# [M4-T06] Rate limiter — 100 turns/hora por org

## Why
Sem rate limit, 1 bug de prompt pode custar muito dinheiro. Proteção básica pré-launch.

## Depends on
[M1-T02] threads, [M2-T01] handleIncoming

## Acceptance tests (write FIRST)
- `convex/_shared/_libs/rateLimit.test.ts`
  - 100 chamadas em 1h por org → OK
  - 101ª → retorna `{error: "rate_limit", retryAfterMs}` estruturado
  - orgs diferentes contam separado
  - settings: `turnsPerHour` configurável por org (override)

## Implementation
- `convex.config.ts` — `app.use(rateLimiter)`
- `convex/_shared/_libs/rateLimit.ts` — helper `checkTurn(orgId)`
- Injeção: no `handleIncoming` antes de streamText; se bloqueado, dispatch mensagem pra user "rate limit reached"
- `app/(authed)/rate-limit-banner.tsx` — UI mostra aviso reactive

## Done when
- Tests verdes
- Mensagem de rate limit aparece no chat + Slack quando passa

## References
- [@convex-dev/rate-limiter](https://www.npmjs.com/package/@convex-dev/rate-limiter)
