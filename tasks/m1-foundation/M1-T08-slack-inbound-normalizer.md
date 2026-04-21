# [M1-T08] Slack inbound normalizer — event → ChannelMessage

## Why
Isolar o shape do Slack do resto da app. O agent nunca vê `<@U123>`, só `@username`. Troca de plataforma fica localizada.

## Depends on
[M1-T07] events httpAction

## Acceptance tests (write FIRST)
- `convex/slack/adapters/normalizeEvent.test.ts`
  - `app_mention` com `<@Ubot> hello` → `{text: "@botname hello", isMention: true}`
  - `message` em DM → `isMention: true` (DMs contam como mention)
  - `message` em canal sem menção → `isMention: false`
  - resolve users via user cache (inject); user desconhecido → fallback `<unknown:U123>`
  - arquivos não-imagem → aggregate em `attachments` (por ora só metadata, download fica em M2)
  - edit/delete events → retornam `null` (ignorar no MVP)

## Implementation
- `convex/slack/_libs/normalizeEvent.ts` — função pura `normalize(slackEvent, {userCache, botUserId}): ChannelMessage | null`
- `convex/_shared/types/channelMessage.ts` — interface (port de [docs/new.md §ChannelMessage](../docs/new.md))
- `convex/slack/adapters/handleIncoming.ts` — internalMutation que:
  1. Normaliza via normalizer
  2. `ensureThread({orgId, agentId, binding:{type:"slack", channelId, threadTs}})`
  3. Persiste mensagem via `@convex-dev/agent.saveMessages` (placeholder em M1 — real wiring M2-T01)
  4. `scheduler.runAfter(0, internal.agent.handleIncoming, {threadId, messageId})`

## Done when
- Tests verdes com 6 fixtures diferentes
- Mensagens aparecem em `threads` + `messages` (Convex agent component quando conectar)

## References
- [docs/new.md §ChannelMessage](../docs/new.md)
- [docs/pi-mono/packages/mom/src/slack.ts](../docs/pi-mono/packages/mom/src/slack.ts) — `SlackEvent` shape
