# [M3-T02] Memory → embedding trigger

**Revisão 2026-04-18**: em vez de `rag.add`, usar `embedMany(ctx, {userId, values: [content], model: embeddingModel})` do `@convex-dev/agent` pra gerar o vetor e salvar em nossa tabela `memory.embedding` (field da própria tabela, com vectorIndex). Delete limpa o embedding com o row. Update regenera embedding se content mudou.

---

_Conteúdo original:_

# [M3-T02-orig] Memory → RAG trigger — insert/update/delete sync

## Why
Toda mutation em `memory` deve refletir no RAG. Se trigger não existe, memórias são indexadas manualmente e ficam desatualizadas.

## Depends on
[M3-T01] rag setup, [M2-T07] memory

## Acceptance tests (write FIRST)
- `convex/memory/_triggers.test.ts`
  - insert memory → `rag.add` chamado 1x com namespace correto
  - update memory (mesmo id) → `rag.replace` (ou delete+add) chamado
  - delete memory → `rag.delete` chamado
  - trigger dentro da transação; se `rag.add` falhar, mutation rollback? → decidir e documentar (proposta: rag async via scheduler pra não bloquear)
- Integration: `memory.search({query:"X"})` retorna memory inserida

## Implementation
- `convex/memory/_triggers.ts` — register via `triggers.register("memories", ...)`
- Opção A (síncrono): chamar `rag.add` dentro da transação
- Opção B (assíncrono): `ctx.scheduler.runAfter(0, internal.rag.syncMemory, {id})` — menos acoplado, menor blast radius se RAG cair
- Preferência: B. Documentar no arquivo.
- `convex/rag/internal/syncMemory.ts` — internalAction que lê memory atual e atualiza RAG

## Done when
- Tests verdes
- Insert memory no dashboard → busca via `memory.search` retorna (eventual consistency ~1s)

## References
- [Skill DDD §Triggers](~/.claude/skills/convex-ddd-architecture/triggers.md)
