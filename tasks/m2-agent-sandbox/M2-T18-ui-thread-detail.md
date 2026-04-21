# [M2-T18] UI `/threads/[id]` — tool calls expandíveis + usage + cost

## Why
Debug e transparência. User vê o que o agente está chamando e quanto custa.

## Depends on
[M2-T01] real handleIncoming, [M2-T15] cost ledger

## Acceptance tests (write FIRST)
- `test/e2e/thread-detail.spec.ts`
  - thread com 2 tool calls → 2 accordions com `args + result` JSON
  - usage footer mostra `tokensIn/Out/Cache` + `costUsd` somado
  - tool call em progresso mostra `_running..._`
  - mensagem SILENT é renderizada como `_deleted_` tag
- Snapshot: thread com 3 mensagens + 2 tool calls (DOM stable)

## Implementation
- `app/threads/[id]/page.tsx` — usa `useThreadMessages({threadId, stream:true})` do `@convex-dev/agent`
- `components/thread/ToolCallCard.tsx` — accordion com args/result
- `components/thread/UsageBadge.tsx` — query `api.cost.queries.byThread.default`
- Sidebar volta pra `/chat`

## Done when
- E2E verde
- Latência de render <300ms com 100 mensagens

## References
- [Plano §M2 UI](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
