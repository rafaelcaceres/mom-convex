# [M3-T03] ~~Messages indexation~~ — CUT (2026-04-18)

**Task cortada.** `@convex-dev/agent` indexa automaticamente quando mensagens são salvas via `streamText`/`generateText`/`saveMessages`. Busca via `fetchContextMessages(ctx, components.agent, {searchText, userId, threadId})`. Não precisa de scheduler próprio. Ver "Revisão RAG" em [TASKS.md](../../TASKS.md).

---

_Conteúdo original preservado abaixo para referência histórica:_

# [M3-T03-orig] Messages indexation — batch scheduler com window 5

## Why
Histórico de conversa também deve ser pesquisável. Processo em batch pra não sobrecarregar embeddings API.

## Depends on
[M3-T01] rag setup

## Acceptance tests (write FIRST)
- `convex/rag/internal/indexMessages.test.ts`
  - 10 mensagens novas → 2 chunks de 5 mensagens cada, cada chunk metadata = `{threadId, orgId, startTs, endTs}`
  - re-indexar idempotente (mesmo hash → skip)
  - mensagens SILENT ignoradas
  - `paginate` respeita cursor em batches de 100
- `convex/crons.test.ts`
  - cron `rag:indexMessages` schedule `"every 15 minutes"`

## Implementation
- `convex/rag/internal/indexMessages.ts` — internalAction
  - Cursor-based pagination (persist em `rag_indexer_state` table)
  - Window slide: 5 mensagens com overlap 1 (pra dar contexto)
  - Hash do chunk pra idempotência
- `convex/crons.ts` — register

## Done when
- Tests verdes
- Após 1 ciclo, `memory.search({scope:"history"})` retorna resultados

## References
- [Plano §Messages indexation](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
