# [M1-T02] Domain `threads` wrapper — binding union (slack/web/event)

## Why
`@convex-dev/agent` tem seu próprio `threads`, mas é single-tenant e não conhece bindings de plataforma. Nosso wrapper adiciona `orgId` + `agentId` + `binding` (Slack channel / Web user / Event) e referencia `agentThreadId`.

## Depends on
[M1-T01] domain agents

## Acceptance tests (write FIRST)
- `convex/threads/domain/thread.model.test.ts`
  - `AdapterBinding` union valida shapes de slack/web/event
  - `ThreadAgg.markEventBinding()` troca binding e retorna novo modelo
- `convex/threads/adapters/thread.repository.test.ts`
  - `createForBinding({orgId, agentId, binding})` persiste
  - `getByBinding(binding)` dedup (idempotente pra mesmo `channelId/threadTs`)
  - `listByAgent(agentId)` retorna threads do agente
- `convex/threads/mutations/ensureThread.test.ts`
  - mesma binding chamada 2x → 1 thread só, retorna mesmo id (fix primeiro via bug: sem concurrency handling → documentar e aceitar idempotência eventual)

## Implementation
- `convex/threads/domain/thread.model.ts`
  - `AdapterBindingModel = v.union(slackBinding, webBinding, eventBinding)`
  - `NewThreadModel`: `orgId`, `agentId`, `agentThreadId: v.string()`, `binding: AdapterBindingModel`
- `convex/threads/domain/thread.repository.ts` — interface com `getByBinding`, `listByAgent`
- `convex/threads/adapters/thread.repository.ts` — indexes `by_org`, `by_agent`, `by_binding_slack`, `by_binding_web`
- `convex/threads/mutations/ensureThread.ts` — cria ou retorna existente baseado em binding; internal
- `convex/threads/queries/listByAgent.ts`
- `convex/threads/_tables.ts`

## Done when
- Tests verdes
- `ensureThread` idempotente
- Documentar: `agentThreadId` não existe ainda em M1 (é placeholder string) — em M2 passará a referenciar `@convex-dev/agent.threads._id` real

## References
- [Plano §Modelo de dados — threads](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
- [docs/new.md §Storage Format](../docs/new.md)
