# [M4-T03] Event scheduling — runAt + crons + lifecycle

## Why
Criar evento no DB não é suficiente — precisa agendar no scheduler/crons do Convex. Cancel/update também precisa sync.

## Depends on
[M4-T01] events, [M4-T02] fire

## Acceptance tests (write FIRST)
- `convex/events/mutations/createEvent.test.ts`
  - immediate → `scheduler.runAfter(0, ...)` chamado
  - one-shot → `scheduler.runAt(at, ...)` + `scheduledId` salvo
  - periodic → `crons.register(name, cron, internal.events.fire, {eventId})` + name persistido
- `convex/events/mutations/cancelEvent.test.ts`
  - one-shot pending → `scheduler.cancel(scheduledId)` + delete row
  - periodic → `crons.delete(name)` + delete row
- `convex/events/mutations/updateEvent.test.ts`
  - troca schedule → cancel old + schedule new

## Implementation
- `convex/events/mutations/createEvent.ts`, `cancelEvent.ts`, `updateEvent.ts`
- `convex/events/_libs/scheduler.ts` — helpers em volta de `ctx.scheduler` e `crons`
- Timezone via `croner` se user especificar

## Done when
- Tests verdes com fake timers
- Manual: criar cron `*/1 * * * *` em dev e verificar que dispara

## References
- [Convex scheduler docs](https://docs.convex.dev/scheduling/scheduled-functions)
- [Convex crons](https://docs.convex.dev/scheduling/cron-jobs)
