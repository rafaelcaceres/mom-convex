# [M1-T07] Slack events httpAction — url_verification + dedupe + enqueue

## Why
Entrypoint de todo evento do Slack. Precisa responder em <3s ou Slack retenta.

## Depends on
[M1-T03] slackInstalls, [M1-T04] dedupe, [M1-T06] signing

## Acceptance tests (write FIRST)
- `convex/slack/adapters/events.httpAction.test.ts`
  - `type: url_verification` → responde `{challenge}` em <100ms
  - signing inválido → 401
  - signing válido + duplicate event_id → 200 mas não enfileira
  - signing válido + event_id novo → grava dedupe + `scheduler.runAfter(0, internal.slack.handleIncoming, {...})`
  - team_id não encontrado em `slackInstalls` → 404 (log estruturado)
  - response returns em <1s (medir com `performance.now()`)

## Implementation
- `convex/slack/adapters/events.httpAction.ts` — fluxo:
  1. Read raw body
  2. Verify signature (M1-T06)
  3. Parse JSON
  4. If `url_verification`, return challenge
  5. `recordOrSkipEvent(event.event_id)` → if duplicate, return 200
  6. `slackInstalls.getByTeamId(event.team_id)` → org/agent resolved
  7. `scheduler.runAfter(0, internal.slack.handleIncoming.default, {event, orgId, installId, agentId})`
  8. Return 200
- `convex/http.ts` — route register
- `convex/slack/internal/handleIncoming.ts` (stub por ora; real em M1-T08)

## Done when
- Tests verdes incluindo budget de 1s
- Manual: Slack event real chega e deduplica em replay
- Log estruturado com `event_id`, `team_id`, latency

## References
- [Slack Events API](https://api.slack.com/events-api)
- [Plano §Risks — Events API latency](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
