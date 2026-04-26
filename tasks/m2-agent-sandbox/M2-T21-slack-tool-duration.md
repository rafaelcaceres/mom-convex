# [M2-T21] Slack tool reply — duração da execução

## Why
Quando uma tool demora, o usuário não tem feedback de quanto tempo cada
chamada custou — só vê o card no thread sem timing. Adicionar `(N.Ns)` no
header dá pista visual imediata pra identificar tool lenta vs cadeia
inteira lenta. Cosmético, mas paga sozinho na primeira vez que alguém
pergunta "por que a resposta demorou?".

## Depends on
[F-03] tool-call thread replies, [M2-T01] handleIncoming real

## Acceptance tests (write FIRST)
- `convex/slack/_libs/formatToolReply.test.ts` extension
  - `durationMs: 234` → header `🔧 \`tool\` (234ms)`
  - `durationMs: 4321` → header `🔧 \`tool\` (4.3s)`
  - sem `durationMs` → header sem sufixo de tempo
  - `durationMs` negativo / NaN / Infinity → omite (não trava)

## Implementation
- [formatToolReply.ts](../../convex/slack/_libs/formatToolReply.ts) — novo
  parâmetro opcional `durationMs?: number`. Helper `formatDuration` decide
  formato `Nms` (sub-segundo) vs `N.Ns` (multi-segundo). Header passa a ser
  `\`${toolName}\`${formatDuration(durationMs)}`.
- [handleIncoming.ts](../../convex/agentRunner/actions/handleIncoming.ts) —
  `Map<toolCallId, startedAt: number>` no escopo do turno. No chunk
  `tool-call` (callback `onChunk`), grava `Date.now()`. No `onStepFinish`,
  para cada `step.toolCalls`, calcula `durationMs = Date.now() - startedAt`
  e passa pro `formatToolReply`. Map descartado quando o action retorna.

## Done when
- Tests verdes
- Validação manual: tool lenta (e.g. `http.fetch` em URL com latência)
  produz card com `(N.Ns)` no Slack thread

## References
- [mom: tool duration display](../../docs/pi-mono/packages/mom/src/agent.ts)
  (linhas 516-544 — referência de UX)
