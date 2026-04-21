# [M3-T14] Smoke M3 — Gmail + Notion + aprovação

## Why
Gate pra M4. Cobre RAG isolation + OAuth + human-in-loop.

## Depends on
Todos de M3.

## Acceptance tests (write FIRST)
- `test/smoke/m3.test.ts`
  - Setup: org com agent + credentials Gmail+Notion (fixtures cifradas)
  - **Cenário 1**: prompt "lê o último email do Mario e resume em 3 bullets"
    - faux model → `gmail.search` → `gmail.get` → texto resposta
    - verifica que credential refresh foi chamado se token expirado
  - **Cenário 2**: "rascunha um email pro Mario dizendo X"
    - faux model → `gmail.send_draft` → pending approval
    - mutation `approvals.approve` → resume turn → draft criado (MSW verifica call)
  - **Cenário 3**: "cria uma memória: 'gosto de respostas em PT-BR'" + próximo turn usa essa memória (alwaysOn)
  - **Cenário 4**: RAG isolation — repetir M3-T05 em escopo menor
- Manual checklist:
  - [ ] OAuth real Gmail → credential cifrada visível
  - [ ] Draft criado no Gmail após aprovação
  - [ ] Memory alwaysOn influencia respostas subsequentes

## Done when
- Suite verde
- Manual checklist completo antes de M4

## References
- [Plano §M3 smoke](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
