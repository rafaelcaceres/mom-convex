# [M4-T09] Smoke M4 — evento + multi-agent + rate limit

## Why
Final gate. Produto pronto pra design partner.

## Depends on
Todos de M4.

## Acceptance tests (write FIRST)
- `test/smoke/m4.test.ts`
  - **Evento periódico**: cria `*/1 * * * *` "check systems" → avança relógio 2min (fake timer) → 2 fires, 2 threads msgs criadas
  - **Multi-agent**: criar 2º agente "Support" + route #support → mensagem em #support dispara agent Support, não o default
  - **Rate limit**: 100 turns em loop → 101º bloqueado + mensagem user-friendly
  - **Observability**: query `costPerDay` retorna dados coerentes com turns executados
  - **Audit**: criar evento via UI → audit log tem entry com `action:"events.createEvent"`
- Manual checklist:
  - [ ] Cron real em workspace Slack dispara no horário certo
  - [ ] `/observability` mostra custo acumulado
  - [ ] 2 agents coexistem sem confundir threads
  - [ ] Rate limit banner aparece em UI

## Done when
- Suite verde
- Checklist completo → produto pronto pra primeiro design partner

## References
- [Plano §M4 smoke](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
