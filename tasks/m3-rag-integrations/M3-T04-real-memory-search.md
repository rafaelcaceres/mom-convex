# [M3-T04] `memory.search` tool — vectorSearch nativo

**Revisão 2026-04-18**: usa `ctx.vectorSearch("memory", "by_embedding", {vector, limit: 10, filter: q => q.eq("orgId", currentOrgId)})` direto. Scope `"history"` usa `fetchContextMessages(ctx, components.agent, {searchText, userId, threadId})`. Scope `"all"` combina os dois. **Não** usa `@convex-dev/rag`.

---

_Conteúdo original:_

# [M3-T04-orig] Real `memory.search` tool — semantic search

## Why
Substituir stub de M2-T08 por RAG real.

## Depends on
[M3-T01] rag, [M3-T02] memory sync, [M3-T03] message indexation

## Acceptance tests (write FIRST)
- `convex/skills/impls/memorySearch.test.ts` (substituir stub)
  - `scope:"memory"` + query semântica → top-5 memórias relevantes (fixtures reais com embeddings mock)
  - `scope:"history"` → chunks de mensagens relevantes
  - `scope:"all"` → union interpolado com score
  - namespace isolado (buscar em orgA não retorna orgB)
  - latência <500ms p95 (com mock)

## Implementation
- `convex/skills/impls/memorySearch.ts` — reescrita
  - Usa `rag.search({namespace, query, topK, filter: {scope: ...}})`
  - Retorna `{content: [{type:"text", text: formatted}]}` agrupado por source

## Done when
- Tests verdes
- Agent em chat real consegue responder "o que sabemos sobre X" usando RAG

## References
- [Plano §RAG tools](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
