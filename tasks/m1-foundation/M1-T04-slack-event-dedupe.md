# [M1-T04] Domain `slack.slackEventDedupe` + TTL cron cleanup

## Why
Slack pode reentregar o mesmo `event_id` se a resposta for >3s. Sem dedupe, o agente processa duplicado.

## Depends on
[M0-T04] customFunctions

## Acceptance tests (write FIRST)
- `convex/slack/adapters/slackEventDedupe.repository.test.ts`
  - `recordOrSkip(eventId)` → retorna `"recorded"` na 1ª vez, `"duplicate"` na 2ª
  - `clearExpired()` remove rows com `seenAt < now - 24h`
  - `clearExpired()` é idempotente
- `convex/slack/crons.test.ts`
  - cron `slack:cleanDedupe` registrado com schedule `"every 1 hours"`

## Implementation
- `convex/slack/domain/slackEventDedupe.model.ts` — `eventId: v.string()`, `seenAt: v.number()`
- `convex/slack/domain/slackEventDedupe.repository.ts` — interface
- `convex/slack/adapters/slackEventDedupe.repository.ts` — impl (index `by_eventId`)
- `convex/slack/mutations/recordOrSkipEvent.ts` — internal
- `convex/slack/internal/clearExpired.ts` — internalMutation, usa `paginate` se >1k rows
- `convex/crons.ts` — register hourly cleanup

## Done when
- Tests verdes
- 2ª entrega do mesmo eventId em M1-T07 httpAction no-op
- Cron visível em Convex dashboard

## References
- [Plano §Slack events httpAction](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
