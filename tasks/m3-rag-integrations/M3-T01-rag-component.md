# [M3-T01] ~~@convex-dev/rag setup~~ — CUT (2026-04-18)

**Task cortada na revisão de arquitetura.** `@convex-dev/agent` já fornece vector search built-in sobre `messages` via `fetchContextMessages`, e pra nossa tabela `memory` vamos usar `vectorIndex` nativo do Convex direto no `defineTable(...)`. Ver "Revisão RAG" em [TASKS.md](../../TASKS.md).

---

_Conteúdo original preservado abaixo para referência histórica:_

# [M3-T01-orig] `@convex-dev/rag` setup + namespace por orgId

## Why
Substitui `grep log.jsonl` do pi-mom por vector search. Isolamento cross-tenant via namespace.

## Depends on
[M1-T01] agents, [M2-T07] memory

## Acceptance tests (write FIRST)
- `convex/rag/setup.test.ts`
  - `rag.add({namespace:`org_${orgId}`, content, metadata})` retorna docId
  - `rag.search({namespace, query})` retorna top-K
  - search em namespace errado retorna `[]` (gate básico de isolation; teste exaustivo em M3-T05)
- config: embedding provider (Anthropic? OpenAI?) — padrão OpenAI `text-embedding-3-small`

## Implementation
- `convex.config.ts` — `app.use(rag)`
- `convex/rag/_libs/client.ts` — helper `ragFor(orgId)` que pre-set namespace
- `.env.example` — `OPENAI_EMBEDDING_KEY` (separado do modelo de chat)
- Wrapper: sempre pass `namespace: org_${orgId}` — API própria nunca aceita namespace raw

## Done when
- Tests verdes
- Embeddings persistem em tabela do componente
- Namespace estritamente derivado de orgId (test com spy no client)

## References
- [@convex-dev/rag](https://www.npmjs.com/package/@convex-dev/rag)
- [Plano §RAG](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
