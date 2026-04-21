# [M1-T10] Slack outbound adapter — postMessage + markdown→mrkdwn + split

## Why
`@convex-dev/agent` e nossa UI usam markdown padrão. Slack usa mrkdwn (`*bold*`, `<url|text>`). Convert localizada = agent fica platform-agnostic.

## Depends on
[M1-T03] slackInstalls (decrypt token), [M1-T09] handleIncoming

## Acceptance tests (write FIRST)
- `convex/slack/_libs/markdownToMrkdwn.test.ts`
  - `**bold**` → `*bold*`
  - `*italic*` → `_italic_`
  - `` `code` `` → `` `code` `` (passthrough)
  - `[link](http://x)` → `<http://x|link>`
  - `@username` → `<@U123>` se user no cache; senão passthrough
  - código multi-linha (triple backtick) passthrough intacto
- `convex/slack/_libs/splitForSlack.test.ts`
  - mensagem >4k chars → array de chunks, nenhum >4000 bytes
  - não quebra meio de bloco de código
  - prefixa chunks 2+ com `_(continued)_`
- `convex/slack/adapters/postMessage.action.test.ts`
  - chama `client.chat.postMessage` com mock (MSW)
  - erro `channel_not_found` → log + re-throw estruturado
  - rate limit (429) → retry com backoff

## Implementation
- `convex/slack/_libs/markdownToMrkdwn.ts` — port de [docs/new.md §Markdown → Slack](../docs/new.md)
- `convex/slack/_libs/splitForSlack.ts` — port de `splitForSlack` em pi-mono (grep nos sources)
- `convex/slack/adapters/postMessage.action.ts` — internalAction
  - Input: `{installId, channelId, threadTs?, markdown, userCache}`
  - Decrypt token
  - Split + convert
  - `chat.postMessage` sequencial (preserva ordem)
- Log `messageTs` retornado pra cada chunk

## Done when
- Tests verdes (25+ cases)
- Mensagens longas no Slack real não quebram renderização

## References
- [docs/pi-mono/packages/mom/src/slack.ts `splitForSlack`](../docs/pi-mono/packages/mom/src/slack.ts)
- [docs/new.md §Markdown → Slack format](../docs/new.md)
