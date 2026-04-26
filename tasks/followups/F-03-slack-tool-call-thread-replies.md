# [F-03] Slack: tool calls como thread replies (estilo pi-mono)

Follow-up surfaced by **M2-T18** post-delivery review. Web chat ganhou tool-call accordions; Slack precisa do equivalente nativo da plataforma — thread replies sob a mensagem principal do bot, mesmo padrão que `docs/pi-mono/packages/mom` já implementa.

## Why

No Slack o equivalente do "expandir accordion" é **thread replies**: a mensagem principal do bot fica limpa (texto da resposta), e tool calls + intermediate updates entram como replies em uma thread do Slack sob aquela mensagem. Mantém o canal legível pra humanos enquanto preserva o detalhe técnico para quem quer auditar. Hoje o adapter só posta a mensagem final via `chat.postMessage` (M1-T10) — sem live-edit, sem replies de tool, sem `chat.update`.

## Depends on

- [M1-T10] `slack.actions.postMessage` (a expandir).
- [M2-T15] `onStepFinish` (entrega o handle dos tool calls em tempo real).
- [F-02] Chat inline (alinha o modelo mental — paridade de UX entre web e slack; F-03 não bloqueia em F-02 mas faz mais sentido fazer depois).

## Acceptance tests (write FIRST)

- `convex/slack/actions/postOrUpdateMain.test.ts` (novo):
  - primeira chamada com `{installId, channel, text, ts: undefined}` → chama `chat.postMessage`, retorna `ts`.
  - segunda chamada com `ts` setado → chama `chat.update` no mesmo `ts`.
  - rate-limit 429 com `Retry-After` é respeitado (estende padrão de `postMessage.ts` existente).
- `convex/slack/actions/postToolReply.test.ts` (novo):
  - posta com `thread_ts: parentTs`, retorna `ts` da reply.
  - 429 retry idem acima.
- `convex/slack/_libs/slackClient.test.ts`:
  - `chatUpdate` cobre status 200/4xx/429 com a mesma shape de `chatPostMessage`.
- Domain tests:
  - `Thread.binding.parentTs` adicional: tracker do `ts` da mensagem principal, optional. Modelo aceita; aggregate setter `setParentTs(ts)` rejeita se binding não-slack.
- Manual smoke: chat real Slack com `http.fetch` — confere mensagem principal limpa + thread reply abrindo com tool args + reply de close com result.

## Implementation

### Slack client wrapper

- `convex/slack/_libs/slackClient.ts` ganha `chatUpdate({botToken, channel, ts, text})` → `https://slack.com/api/chat.update` com mesmo error/retry shape de `chatPostMessage`.
- `chatPostMessage` já aceita `thread_ts` opcional — preserva e **expõe `ts` no return** (hoje volta no body, é descartado).

### Two new actions

- `internal.slack.actions.postOrUpdateMain` — args `{installId, channelId, threadTs?, ts?, text}`. Se `ts` ausente, posta e retorna `ts`. Se presente, edita.
- `internal.slack.actions.postToolReply` — args `{installId, channelId, parentTs, text}`. Posta como `thread_ts: parentTs`, retorna `ts` da reply.
- M1-T10 `postMessage` original fica como compat fino que delega pra `postOrUpdateMain` sem `ts` (mantém call-sites existentes).

### Wire em handleIncoming

Em `convex/agentRunner/actions/handleIncoming.ts`:

- Adicionar `mainMessageTs: string | null = null` na closure do action.
- No `onStepFinish` (já existente, hoje só apenda no costLedger): quando `step.toolCalls.length > 0` **e** binding é slack:
  - se `mainMessageTs` ainda nulo, postar texto principal via `postOrUpdateMain` primeiro pra capturar `ts`;
  - postar `postToolReply` com `parentTs: mainMessageTs` carregando `args` (e em followup do mesmo step, `result`).
- Trocar o post final único por `postOrUpdateMain` capturando `ts` no primeiro envio. Tool replies bufferizadas que chegaram antes do `ts` existir são enfileiradas.
- **Persistir `mainMessageTs` no thread binding** (via aggregate `Thread.setParentTs(ts)`) pra sobreviver entre actions e crashes — sem isso, retry de uma turn perderia o anchor e duplicaria a mensagem.

### Serialização

Mesmo `updatePromise = updatePromise.then(...)` chain que pi-mono usa serializa as chamadas Slack — nada de race entre múltiplos `postInThread` no mesmo step. Implementar como helper `serialize(fn)` no scope do action.

### Rate limit budget

Slack permite ~1 msg/sec por canal sem queue. Tool calls em massa (>10 num turn) devem agrupar replies. M2 cap atual de `stepCountIs(8)` já bounding, mas adicionar `BATCH_TOOL_REPLIES = true` flag pra concatenar `argsJson` de múltiplos calls do mesmo step em uma única reply.

### Domain change

Adicionar `parentTs?: string` no `Thread.binding` quando `type: "slack"`. Migration: campo optional, sem rewrite — threads antigos rodam normal (`parentTs` null = primeira turn cria, persiste pro próximo).

## Non-goals

- Live-edit de chunks de texto incremental (stream parcial pra `chat.update` em real-time). Primeiro pass posta o texto final como hoje, e usa o `ts` retornado para os tool replies. Stream incremental fica para depois quando virmos demanda.
- Apagar tool replies ao final de cada turn (pi-mono faz cleanup no end-of-turn). Mantém-se: history visível ajuda debug.
- Botões interativos (Slack Block Kit / approval flow) nas tool replies — fica pra M3-T11 (HITL approval).

## Done when

- Slack chat real mostra mensagem principal + thread reply por tool call (golden path http.fetch).
- Tests cobrem post/update/reply, retry 429, e domain setter.
- `mainMessageTs` persiste entre crashes (manual: matar action mid-turn, confirmar próximo turn não duplica mensagem principal).
- Backwards-compat: threads existentes (sem `parentTs`) continuam recebendo posts normais.

## References

- Pattern reference: `docs/pi-mono/packages/mom/src/slack.ts:187-220` (`postMessage` / `updateMessage` / `postInThread` retornando `ts`); `docs/pi-mono/packages/mom/src/main.ts:114-217` (`createSlackContext` com `respond` / `respondInThread` + `updatePromise` chain pra serializar).
- Adapter atual a estender: `convex/slack/actions/postMessage.ts`, `convex/slack/_libs/slackClient.ts`.
- Domain a tocar: `convex/threads/domain/thread.model.ts` (SlackBinding + `parentTs?`).
- Hook point: `convex/agentRunner/actions/handleIncoming.ts:103-145` (`onStepFinish` já tem `step.toolCalls`).
- Plano: `~/.claude/plans/nao-faz-sentido-isso-peppy-fairy.md`.
