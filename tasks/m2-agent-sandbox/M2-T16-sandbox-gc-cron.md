# [M2-T16] Sandbox GC cron — hard destroy >7d idle

## Why
Vercel Sandbox persistente tem custo de storage. Sandboxes inativos devem ser destruídos; thread que voltar a ser usada cria novo.

## Depends on
[M2-T10] sandboxes, [M2-T11] vercel wrapper

## Acceptance tests (write FIRST)
- `convex/sandbox/internal/gc.test.ts`
  - com fake timers: 3 sandboxes (1d/5d/8d idle) → apenas 8d marcado destroyed
  - dry-run mode: retorna lista mas não chama client.destroy
  - erro em um destroy não interrompe os outros
- `convex/crons.test.ts`
  - cron `sandbox:gc` registrado com schedule `"daily at 03:00 UTC"`

## Implementation
- `convex/sandbox/internal/gc.ts` — internalAction
  - `sandboxes.repository.listIdle(7 * 24 * 60 * 60 * 1000)`
  - Iterate, `client.destroy`, `markDestroyed`
  - Log estruturado por sandbox
- `convex/crons.ts` — adicionar cron
- CLI local: `pnpm sandbox:gc:dry` pra inspecionar

## Done when
- Tests verdes
- Cron visível em Convex dashboard

## References
- [Plano §Sandbox lifecycle](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
