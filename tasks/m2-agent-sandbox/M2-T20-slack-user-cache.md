# [M2-T20] Slack user-cache + mention resolution

## Why
Em M1, o cache de usuários do Slack foi inicializado vazio
([handleIncomingEvent.ts](../../convex/slack/actions/handleIncomingEvent.ts):
nota "M2 work"). Sem ele, todo `<@U…>` na mensagem do usuário cai para
`<unknown:U…>` e o agente não consegue endereçar pessoas pelo nome. Esta
task fecha o gap: hidrata um diretório por workspace via `users.list` e o
mantém atualizado por cron.

## Depends on
[M1-T03] slackInstalls (token criptografado), [M1-T08] inbound normalizer
(consumer da cache)

## Acceptance tests (write FIRST)
- `convex/slack/_libs/usersFetcher.test.ts`
  - paginação: walk de `next_cursor` em 2+ páginas → flat list ordenada
  - `deleted=true` filtrado
  - `display_name` preferido sobre `real_name`; fallback para `name` quando ambos vazios
  - `ok:false` → ConvexError com `users_list_failed`
  - cap de páginas (default 50) bloqueia loop infinito
- `convex/slack/adapters/slackUserCache.repository.test.ts`
  - `upsertByTeamUser` insere e replace por `(teamId, userId)`
  - `getByTeamUser` escopa por team — mesmo `userId` em times diferentes não vaza
  - `listByTeam` retorna só users daquela workspace
- `convex/slack/actions/syncUsers.test.ts`
  - happy path: 2 páginas mockadas → upsert do conjunto, deleted filtrado
  - re-run substitui rows para usuários renomeados (idempotente)
  - install não encontrado → ConvexError `install_not_found`
  - Slack `missing_scope` → ConvexError propagada

## Implementation
- Schema: tabela `slackUserCache` com índices `by_team_user`, `by_team`, `by_org`
  ([_tables.ts](../../convex/slack/_tables.ts), [domain/slackUserCache.model.ts](../../convex/slack/domain/slackUserCache.model.ts))
- Domain port + adapter:
  [domain/slackUserCache.repository.ts](../../convex/slack/domain/slackUserCache.repository.ts),
  [adapters/slackUserCache.repository.ts](../../convex/slack/adapters/slackUserCache.repository.ts)
- Web API wrapper `usersList` + helper puro paginado `fetchAllUsers`
  ([_libs/slackClient.ts](../../convex/slack/_libs/slackClient.ts), [_libs/usersFetcher.ts](../../convex/slack/_libs/usersFetcher.ts))
- Action `syncUsers` (per-install) e fanout `syncAllInstallUsers` (cron diário 02:30 UTC)
- Query `getUsersByTeam` + helper `listAllInstallIds`; mutation
  `upsertCachedUsers` (batch de 100 — mantém abaixo do limite per-mutation)
- [handleIncomingEvent.ts](../../convex/slack/actions/handleIncomingEvent.ts)
  hidrata a cache via `getUsersByTeam` antes de `normalizeSlackEvent`;
  primeira chamada com cache vazia agenda `syncUsers` em background
  (fire-and-forget; próxima mensagem já vê a cache populada)
- Cron diário em [convex/crons.ts](../../convex/crons.ts) chama o fanout

## Done when
- Tests verdes (`pnpm vitest run convex/slack`)
- Mensagem com mention real renderiza com `@username` (não `<unknown:U…>`)
- Tabela `slackUserCache` populada após `syncUsers` no dashboard
- Cron `slack:syncAllInstallUsers` visível em Convex dashboard

## References
- [Análise mom vs nossa Slack](../../docs/internal/analise-slack-mom.md)
  (P1 do roadmap)
- [Slack `users.list` docs](https://api.slack.com/methods/users.list)
