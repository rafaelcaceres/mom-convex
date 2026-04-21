# [M2-T15] `onStepFinish` → costLedger via internal mutation

## Why
Fechar loop: todo step produz 1 row no ledger. Sem isso, [M2-T14](M2-T14-domain-cost-ledger.md) fica sem dados.

## Depends on
[M2-T01] handleIncoming real (streamText), [M2-T14] costLedger

## Acceptance tests (write FIRST)
- `convex/cost/_libs/priceFromUsage.test.ts`
  - mapeia `{model:"claude-sonnet-4-5", tokensIn:100, tokensOut:200, cacheRead:50}` → costUsd correto
  - model desconhecido → custo 0 + warn log
- `convex/agentRunner/internal/handleIncoming.test.ts` extension
  - 1 turn com 2 tool calls → 3 rows no ledger (LLM call + 2 tool calls? ou só LLM? — docs AI SDK: onStepFinish é por step do LLM, tools não contam como step separado). Ajustar assert conforme comportamento real
  - cacheRead/cacheWrite populados se provider retorna

## Implementation
- `convex/cost/mutations/record.ts` — internalMutation chamada de dentro de action (via `ctx.runMutation`)
- `convex/cost/_libs/priceFromUsage.ts` — table `modelPrices.json` com custo por 1M tokens (input/output/cache)
- No `handleIncoming`: passar callback `onStepFinish: async ({usage, stepType}) => { await ctx.runMutation(internal.cost.mutations.record.default, {...}) }`

## Done when
- Tests verdes
- Dashboard Convex mostra rows populadas em testes reais

## References
- [Anthropic pricing](https://www.anthropic.com/pricing)
- [AI SDK onStepFinish](https://ai-sdk.dev/docs/ai-sdk-core/generating-text)
