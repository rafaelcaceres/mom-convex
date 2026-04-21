# [M1-T09] `internal.agent.handleIncoming` — echo version (M1)

## Why
Fecha o loop Slack→agent→Slack antes de introduzir `@convex-dev/agent` real. Echo valida toda a pipeline de inbound/outbound sem complexidade de LLM.

## Depends on
[M1-T08] inbound normalizer

## Acceptance tests (write FIRST)
- `convex/agentRunner/handleIncoming.test.ts`
  - user message "hello" → persiste user msg + salva assistant msg `"echo: hello"`
  - binding slack → chama `internal.slack.adapters.postMessage` com thread_ts correto
  - binding web → apenas persiste (UI lê reactive)
  - binding event → também apenas persiste por ora
  - mensagens vazias → skip

## Implementation
- `convex/agentRunner/internal/handleIncoming.ts` — internalAction
  - Carrega thread
  - Roda "LLM" fake (template literal `"echo: ${userText}"`)
  - Persiste assistant message
  - Se binding=slack, dispatch `internal.slack.postMessage.default`
- `convex/agentRunner/mutations/saveMessage.ts` — persiste via `@convex-dev/agent` ou tabela wrapper stub
- Por ora, tabela `messages_stub` é interna (placeholder até M2-T01 substituir por component oficial)

## Done when
- Tests verdes
- Web chat em localhost: manda "oi" → "echo: oi" reactive
- Slack: @bot "oi" → "echo: oi" no canal

## References
- [Plano §M1 — Foundation](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
