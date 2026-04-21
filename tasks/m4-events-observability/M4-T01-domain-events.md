# [M4-T01] Domain `events` — Immediate | OneShot | Periodic

## Why
Agent se agenda sozinho (ex: "me lembre em 1h", "checar status a cada 5min"). Paridade com `events.ts` do pi-mom.

## Depends on
[M1-T01] agents, [M1-T02] threads

## Acceptance tests (write FIRST)
- `convex/events/domain/event.model.test.ts`
  - união Immediate|OneShot|Periodic tipa corretamente
  - `OneShotEvent.at` > now (validator)
  - `PeriodicEvent.cron` valida expressão via `croner`
  - `EventAgg.cancel()` marca deleted
- `convex/events/adapters/event.repository.test.ts`
  - `create`, `getById`, `listByAgent`, `listReady(now)`
  - `scheduledId` armazenado pra cancel

## Implementation
- `convex/events/domain/event.model.ts`
  - Base: `orgId`, `agentId`, `binding`, `text`, `createdAt`, `scheduledId?: v.optional(v.string())`
  - Union: `type: v.union(v.literal("immediate"), v.literal("one-shot"), v.literal("periodic"))`
  - `at?: v.optional(v.number())`, `cron?: v.optional(v.string())`, `timezone?: v.optional(v.string())`
- `convex/events/adapters/event.repository.ts`
- `convex/events/_tables.ts` — indexes `by_agent`, `by_next_run`

## Done when
- Tests verdes
- Validators rejeitam shapes incorretos

## References
- [docs/pi-mono/packages/mom/src/events.ts:43-375](../docs/pi-mono/packages/mom/src/events.ts)
- [Plano §Eventos](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
