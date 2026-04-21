# [M2-T01] `@convex-dev/agent` component + agentFactory + **real `handleIncoming`**

## Why
Abre M2 com um agente **de verdade** já no loop: substitui o echo stub de M1 pelo runtime do AI SDK via `@convex-dev/agent`, rodando `agent.streamText` ponta a ponta no menor recorte possível (sem tools, sem prompt builder, sem cost ledger). A decisão deliberada é que **cada passo seguinte de M2 (T04, T09, T12, T15) seja testado contra IA real**, ao invés de empilhar 12 tasks em cima de um stub e descobrir os problemas todos juntos no fim.

Factory garante 1 `Agent` instance por org×agentId×modelId (lazy, cacheada).

## Depends on
[M1-T01] agents domain, [M1-T02] threads, [M1-T09] echo handleIncoming (substituído por este)

## Acceptance tests (write FIRST)
- `convex/agents/_libs/agentFactory.test.ts`
  - `getAgent(orgId, agentId)` cache hit: 2 calls retornam mesma instance
  - modelId diferente em `agents` → cache invalida e nova instance
  - chat provider derivado de `modelProvider` (anthropic|openai|google) — por ora só anthropic
- `convex/agents/adapters/threadBridge.test.ts`
  - `createAgentThread(wrapperThreadId)` retorna `agentThreadId`
  - `saveUserMessage(agentThreadId, text)` persiste no component
  - `useThreadMessages` fakery retorna lista
- `convex/agentRunner/internal/handleIncoming.test.ts` — **faux provider scripted (zero tokens gastos em CI)**
  - user "hello" → faux LLM retorna "hi there" → assistant message **"hi there"** persistida via bridge (não mais `"echo: hello"`)
  - binding slack → `onFinish` chama `internal.slack.actions.postMessage.default` com texto final
  - binding web → apenas persiste (UI lê reactive)
  - binding event → apenas persiste
  - mensagem vazia → skip (parity com M1-T09)

## Implementation
- `convex.config.ts` — `app.use(agent)`
- `convex/agents/_libs/agentFactory.ts` — `Map<key, Agent>` cache; key = `${orgId}:${agentId}:${modelId}`
  - `systemPrompt` por ora = `agent.systemPrompt` raw do record (string direta — o builder dinâmico chega em [M2-T09](M2-T09-system-prompt-builder.md))
- `convex/threads/mutations/ensureThread.ts` — criar `agentThreadId` via component
- `convex/agents/adapters/threadBridge.ts` — helpers que encapsulam `agent.saveMessage`, `agent.streamText`
- `convex/agentRunner/internal/handleIncoming.ts` — **reescreve** o echo:
  - Load thread → resolve agent via `agentFactory`
  - `agent.streamText({ threadId: agentThreadId, prompt: userText })` — **sem `tools` ainda** (chegam em [M2-T04](M2-T04-resolve-tools-bridge.md))
  - `onFinish`: se binding=slack, schedule `internal.slack.actions.postMessage.default`
  - Sem `stepCountIs` ainda (só faz sentido com tools — entra em T04)
  - Sem `onStepFinish` (entra em [M2-T15](M2-T15-on-step-finish-cost.md))

## Done when
- Tests verdes (faux provider — regra de CI continua: zero tokens)
- `messages_stub` removido; rota nova cobre regressão de M1-T09
- **Manual smoke com IA real** (ANTHROPIC_API_KEY no env):
  - `pnpm dev` + web chat: "oi" → resposta real do Claude (não mais "echo: oi")
  - Slack (workspace de teste): `@mom oi` → resposta real postada no thread

## Follow-ups (tracked, not blocking this task)
- **Live-edit UX no Slack** (ex-M2-T13): spec atual só posta texto final no `onFinish`. A ref implementation em `docs/pi-mono/packages/mom/src/main.ts:141-196` + `slack.ts:192-194` faz UX estilo terminal editando **uma única mensagem** incrementalmente via `chat.update`. Dá pra fazer em serverless sem Socket Mode.
  - Primeiro chunk: `postMessage` → guarda `mainTs` em `threads.slackMeta.mainTs`.
  - Chunks seguintes: escreve em `threads.accumulatedText`. Trigger em `threads` detecta mudança + debounce (>1s) → agenda `updateSlackMessage` action.
  - Action pega texto atual + `mainTs` → `chat.update` (rate-limit Slack ~1/s casa com debounce).
  - `onFinish`: update final sem cursor `▋`.
  - Ganho: web chat já sobrevive de graça (texto mora no DB, useQuery reactivo); Slack vê "digitação" em tempo real.
  - Abrir como M2-T13b se quiser priorizar; por ora, post-only no `onFinish` serve o smoke.
- **Abort / auto-retry**: M1 não tinha; não bloqueia T01. Endereçar junto com rate-limiter em [M4-T06](../m4-events-observability/M4-T06-rate-limiter.md) ou follow-up dedicado.

## References
- [@convex-dev/agent](https://www.npmjs.com/package/@convex-dev/agent)
- [AI SDK streamText](https://ai-sdk.dev/docs/ai-sdk-core/generating-text)
- [Plano §Runtime do agente](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
- Ref implementation com live-edit UX: `docs/pi-mono/packages/mom/src/main.ts:141-196` + `slack.ts:192-194`
