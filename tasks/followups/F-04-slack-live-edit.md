# [F-04] Slack: live-edit terminal-like

Follow-up surfaced after F-03 shipped. F-03 trouxe tool calls e reasoning como thread replies sob a mensagem principal, mas a main message ainda ficava estática (`_Working…_` → final text de uma vez). Falta a sensação "terminal" do `docs/pi-mono/packages/mom`: a mensagem principal cresce em tempo real conforme o agent pensa.

## Why

UX: hoje o usuário fica olhando "Working…" parado por 5–30s sem feedback de progresso. F-03 explicitamente marcou live-edit como non-goal ("Stream incremental fica para depois quando virmos demanda" — `F-03-slack-tool-call-thread-replies.md:68`); a demanda apareceu. O efeito desejado é o que o `mom` package implementa: text deltas crescem dentro da própria mensagem principal, tool calls anunciam-se com `_→ tool_` que vira `_✓ tool_` ao terminar, com indicador `…` enquanto trabalha. Detalhe técnico (args/output das tools, reasoning completo) continua na thread sob a main — paridade com mom.

## Depends on

- [F-03] já entregue — `chat.update`, `parentTs` no binding, thread replies de tool/reasoning, `slackPoster` com retry 429.
- `streamText` do AI SDK expor `onChunk` (já expõe — verificado).

## Acceptance tests (write FIRST)

- `convex/slack/_libs/slackPainter.test.ts` (novo):
  - 1º `appendText` chama `chat.postMessage` e persiste `ts`.
  - N text-deltas dentro de 700ms → 1 `chat.update`.
  - `markToolStart` agenda flush dentro da janela (coalesce); marker `_→ name_` aparece no payload.
  - `markToolEnd(ok=true|false)` flips marker em-place pra `_✓_` / `_✗_`.
  - `flushFinal` substitui texto pelo final mrkdwn, sem `…`.
  - Empty stream: `flushFinal` posta via `chat.postMessage` quando não houve chunk.
  - Eventos pós-`flushFinal` viram no-op (idempotência).
- `convex/agentRunner/actions/handleIncoming.test.ts`:
  - Existente "slack binding (no tools)" atualizado: agora há 1 post + 1 update (anchor + flushFinal).
- Manual smoke (chat real Slack):
  - Pergunta sem tool: confere main message crescendo em chunks (não tudo de uma vez).
  - Pergunta com tool: `_→ http.fetch_` aparece, vira `_✓ http.fetch_`, thread reply com args+result.
  - Anthropic com extended thinking: snippet em itálico na main + thread reply com reasoning completo.

## Implementation

### `convex/slack/_libs/slackPainter.ts` (novo)

Factory `createSlackPainter({ botToken, channelId, threadTs, persistMainTs })` retorna painter stateful por turn:
- `appendText`, `markToolStart`, `markToolEnd`, `markReasoning`, `setWorking` — atualizam segments e agendam flush.
- `flushFinal(finalMrkdwn)` — cancela timer, drena chain, escreve texto final.
- Internamente: promise chain serializa writes; throttle 700ms coalesce text-deltas; primeiro write é `chat.postMessage` (captura `ts`), demais são `chat.update`. `markdownToMrkdwn` aplicado em segmentos de texto. Trunca em 35K chars.
- Test seams pra `postFn` / `updateFn` / `now` / `setTimer` / `clearTimer`.

### `convex/agents/adapters/threadBridge.ts`

Expor `onChunk: StreamTextOnChunkCallback<ToolSet>` no `streamAssistantReply` e forward direto pro `agent.streamText`. AI SDK já tipa as variantes: `text-delta`, `tool-call`, `tool-result`, `reasoning-delta`, etc. — caller decide quais consumir.

### `convex/agentRunner/actions/handleIncoming.ts` (refatorado)

- Trocar `slackOutbound.mainTs + ensureSlackAnchor` por `painter = createSlackPainter(...)` quando binding é slack.
- Remover post antecipado de `_Working…_` — painter não posta nada até o 1º chunk.
- `onChunk`:
  - `text-delta` → `painter.appendText(chunk.text)`.
  - `tool-call` → `painter.markToolStart({ toolCallId, toolName })`.
- `onStepFinish` (mantém cost ledger; ganha):
  - Para cada `step.toolCalls`: `painter.markToolEnd({ toolCallId, ok })` (deriva `ok` do `'error' in call`).
  - Se reasoning: `painter.markReasoning(buildReasoningSnippet(text))` + thread reply existente.
  - Thread replies das tools (existentes via `formatToolReply`) — anchor preferencial é `painter.getMainTs()`.
- Após `streamAssistantReply` retornar: `await painter.flushFinal(markdownToMrkdwn(replyText))`.

## Non-goals

- Cleanup de thread replies no fim do turn — pi-mono faz, mantemos histórico.
- Block Kit / botões interativos — futuro M3 HITL.
- Cadência adaptativa por provider — janela 700ms única.
- Multi-message split quando estoura 35K — F-05 se virar problema.

## Done when

- Slack chat real mostra main message crescendo + markers de tool inline + thread replies de detalhe.
- Tests cobrem painter (throttle, force-flush, render, idempotência).
- `handleIncoming.test.ts` atualizado com fluxo post+update.
- Backwards-compat: thread sem `parentTs` (F-03 anterior) continua funcionando — painter cria anchor novo.

## References

- `docs/pi-mono/packages/mom/src/main.ts:114-217` — `createSlackContext` com `respond` + `updatePromise` chain.
- `docs/pi-mono/packages/mom/src/slack.ts:187-220` — postMessage/updateMessage retornando `ts`.
- F-03 anterior: `tasks/followups/F-03-slack-tool-call-thread-replies.md`.
- Plano: `~/.claude/plans/gostaria-que-o-comportamento-purring-brook.md`.
