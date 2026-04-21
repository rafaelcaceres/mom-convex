# [M2-T10] Domain `sandbox.sandboxes` — 1 por thread

## Why
Rastreia qual Vercel Sandbox pertence a qual thread. Sem isso, cada call de `sandbox.*` criaria um novo sandbox.

## Depends on
[M1-T02] threads, [M0-T04] customFunctions

## Acceptance tests (write FIRST)
- `convex/sandbox/adapters/sandbox.repository.test.ts`
  - `getByThread(threadId)` retorna aggregate ativo; null se não existe ou destroyed
  - `markUsed(id)` atualiza `lastUsedAt`
  - `markDestroyed(id)` muda status
  - `listIdle(olderThanMs)` retorna sandboxes inativos
- `convex/sandbox/domain/sandbox.model.test.ts`
  - `SandboxAgg.isExpired(maxIdleMs)` calcula corretamente

## Implementation
- `convex/sandbox/domain/sandbox.model.ts`
  - `threadId`, `provider: v.literal("vercel")`, `sandboxId: v.string()`, `persistentId: v.optional(v.string())`, `status: v.union(v.literal("active"), v.literal("stopped"), v.literal("destroyed"))`, `createdAt`, `lastUsedAt`
- `convex/sandbox/domain/sandbox.repository.ts` + impl
- `convex/sandbox/_tables.ts` — indexes `by_thread`, `by_idle_status` (composite)

## Done when
- Tests verdes
- Wrapper M2-T11 consome este repo

## References
- [Plano §Sandbox](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
