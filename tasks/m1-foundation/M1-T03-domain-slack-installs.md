# [M1-T03] Domain `slack.slackInstalls` — model + encryption dos tokens

## Why
Guarda bot token cifrado + metadata do workspace Slack. Sem isso não há como o outbound adapter fazer `chat.postMessage` nem o inbound resolver teamId→org.

## Depends on
[M0-T05] tenancy, [M0-T06] crypto

## Acceptance tests (write FIRST)
- `convex/slack/adapters/slackInstall.repository.test.ts`
  - `installForOrg({orgId, teamId, botToken, ...})` persiste com `botTokenEnc` (plaintext não aparece no row)
  - `getByTeamId(teamId)` retorna aggregate com `decryptBotToken()` funcionando
  - `getByTeamId` para teamId inexistente retorna null
  - rotação: `installForOrg` em teamId já existente atualiza (upsert)
- Security assert: SELECT do row via `t.run(ctx => ctx.db.get(id))` não contém a string do botToken em plaintext

## Implementation
- `convex/slack/domain/slackInstall.model.ts`
  - `NewSlackInstallModel`: `orgId`, `teamId`, `teamName`, `botTokenEnc: v.object({ciphertextB64, nonceB64, kid})`, `scope: v.string()`, `botUserId: v.string()`
- `convex/slack/domain/slackInstall.repository.ts` — interface + `getByTeamId`, `listByOrg`
- `convex/slack/adapters/slackInstall.repository.ts` — impl; método `decryptBotToken(agg)` usa `crypto.decrypt`
- `convex/slack/_tables.ts` — `by_teamId`, `by_org`
- `convex/slack/mutations/installForOrg.ts` (internal)

## Done when
- Tests verdes incluindo security assert
- Aggregate nunca expõe plaintext via `getModel()` — só via `decryptBotToken()`
- Documentar no repo README do domain: quem chama `decryptBotToken` vive só em `adapters/*.action.ts`

## References
- [docs/quero-explorar-mais-o-wild-papert.md §slackInstalls](../docs/quero-explorar-mais-o-wild-papert.md)
- [M0-T06 crypto helper](../m0-setup/M0-T06-crypto-secretbox.md)
