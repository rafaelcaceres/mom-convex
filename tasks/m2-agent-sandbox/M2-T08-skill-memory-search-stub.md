# [M2-T08] Skill `memory.search` — stub (RAG vem em M3)

## Why
Permite que o agente pergunte "o que sei sobre X". Em M2 só retorna memórias alwaysOn (keyword substring match). Em M3-T04 vira RAG real.

## Depends on
[M2-T05] invoke, [M2-T07] memory

## Acceptance tests (write FIRST)
- `convex/skills/impls/memorySearch.test.ts`
  - query "python" retorna memória com "python" no content
  - scope="memory" busca só em `memory` table
  - scope="history" retorna `[]` em M2 (TODO: M3)
  - scope="all" combina (stub combina só memory em M2)
  - resultado limitado a top 10

## Implementation
- `convex/skills/impls/memorySearch.ts`
  - Zod: `{query: z.string(), scope: z.enum(["memory","history","all"]).default("all"), limit: z.number().default(10)}`
  - Impl: query `memory` repo, substring match case-insensitive
  - Registrar em `skillImpls`
- `convex/skills/_seeds.ts` — adicionar `memory.search`

## Done when
- Tests verdes
- Agent com skill habilitada consegue consultar memória em chat real

## References
- [Plano §Skills bootstrap](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
