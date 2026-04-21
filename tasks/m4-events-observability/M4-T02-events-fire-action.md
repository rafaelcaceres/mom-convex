# [M4-T02] `internal.events.fire` — resolve binding → thread → synthesize msg

## Why
Dispatcher unificado: scheduler.runAt / crons / immediate todos caem aqui. Sintetiza mensagem no formato `[EVENT:type:schedule] text` (compatível com pi-mom).

## Depends on
[M4-T01] events, [M2-T01] handleIncoming

## Acceptance tests (write FIRST)
- `convex/events/internal/fire.test.ts`
  - immediate → resolve thread via binding (cria se não existe) → synth msg → dispatch handleIncoming
  - one-shot → idem + delete event row após fire
  - periodic → idem, mantém row, atualiza `lastFiredAt`
  - event deletado (`cancel`) → fire no-op graceful
  - binding slack sem install → log warn, não throw

## Implementation
- `convex/events/internal/fire.ts` — internalAction
  - Load event
  - Resolve binding → `threads.ensureThread`
  - Synthesize: `[EVENT:${type}:${schedule}] ${text}` como user message
  - `scheduler.runAfter(0, internal.agentRunner.handleIncoming.default, {threadId, messageId})`
  - Se one-shot: delete event

## Done when
- Tests verdes (5 cenários)
- Log estruturado com `{eventId, type, threadId}`

## References
- [Plano §Eventos](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
