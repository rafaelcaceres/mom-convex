# [M2-T07] Domain `memory` — scoped + alwaysOn + vectorIndex nativo

**Revisão 2026-04-18**: `defineTable` inclui `vectorIndex("by_embedding", {vectorField: "embedding", dimensions: 1536})` nativo. Embedding é gerado via `embedMany` do `@convex-dev/agent` (M3-T02 trigger). Search em M3-T04 usa `ctx.vectorSearch("memory", "by_embedding", {vector, limit})` com filter `orgId` — sem `@convex-dev/rag`.

---

_Conteúdo original:_

# [M2-T07-orig] Domain `memory` — scoped + alwaysOn flag

## Why
Memória persistente (diferente do histórico de mensagens). Escopos: org-wide, agent-wide, thread-specific. `alwaysOn=true` injeta no system prompt.

## Depends on
[M0-T04] customFunctions, [M0-T05] tenancy

## Acceptance tests (write FIRST)
- `convex/memory/domain/memory.model.test.ts`
  - `MemoryAgg.matchesScope({agentId, threadId})` → true se escopo bate
  - `alwaysOn` default false
- `convex/memory/adapters/memory.repository.test.ts`
  - `listForAgent({orgId, agentId})` retorna org+agent scopes unidos
  - `listForThread({orgId, agentId, threadId})` inclui thread-scoped
  - `listAlwaysOn({orgId, agentId, threadId})` filtra só alwaysOn
- `convex/memory/mutations/upsertMemory.test.ts`
  - auth + role admin pra org-scope; member pra thread-scope
  - content max 8k chars

## Implementation
- `convex/memory/domain/memory.model.ts`
  - `scope: v.union(v.literal("org"), v.literal("agent"), v.literal("thread"))`
  - `orgId`, `agentId?`, `threadId?`, `content: v.string()`, `alwaysOn: v.boolean()`, `updatedBy: v.id("users")`, `updatedAt: v.number()`
- `convex/memory/domain/memory.repository.ts` + impl
- `convex/memory/_tables.ts` — indexes `by_org_scope`, `by_agent`, `by_thread`
- `convex/memory/mutations/upsertMemory.ts`, `deleteMemory.ts`
- `convex/memory/queries/listForAgent.ts`, `listForThread.ts`, `listAlwaysOn.ts`

## Done when
- Tests verdes
- Cross-scope queries sem vazamento

## References
- [Plano §RAG](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
