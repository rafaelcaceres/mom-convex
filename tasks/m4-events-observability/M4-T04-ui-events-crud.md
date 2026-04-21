# [M4-T04] UI `/agents/[id]/events` — CRUD + cron helper

## Why
User não vai escrever cron expression à mão. Precisa de UI com preview da próxima execução.

## Depends on
[M4-T01] events, [M4-T03] scheduling

## Acceptance tests (write FIRST)
- `test/e2e/events.spec.ts`
  - criar one-shot em 5min futuro → aparece na lista com countdown
  - criar periodic `*/5 * * * *` → cron preview mostra "every 5 minutes"
  - editar periodic → schedule atualiza, countdown zera
  - cancel → some da lista + row deletada
  - binding selector: channel slack / my web thread / new web thread

## Implementation
- `app/agents/[id]/events/page.tsx`
- `components/events/EventForm.tsx` — preset buttons ("Daily 9am", "Every 5 min", "One-time in...")
- `components/events/CronPreview.tsx` — usa `cronstrue` pra human-friendly
- `components/events/EventList.tsx`

## Done when
- E2E verde
- UX: criar evento em 3 clicks comum

## References
- [cronstrue](https://www.npmjs.com/package/cronstrue)
