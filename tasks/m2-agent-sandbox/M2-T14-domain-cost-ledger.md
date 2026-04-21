# [M2-T14] Domain `cost.costLedger` — tokens + custo por step

## Why
Observability base. Sem ledger, não tem dashboard em M4 nem limite de custo por org.

## Depends on
[M0-T04] customFunctions

## Acceptance tests (write FIRST)
- `convex/cost/adapters/costLedger.repository.test.ts`
  - `record({...})` persiste com `createdAt`
  - `sumByOrgInRange(orgId, from, to)` retorna agregado correto
  - `topThreadsByCost(orgId, from, to, limit=10)` ordenado desc
  - `topToolsByCost(orgId, from, to, limit=10)` agregado por toolName

## Implementation
- `convex/cost/domain/costLedger.model.ts`
  - `orgId`, `agentId`, `threadId`, `provider`, `model`, `tokensIn`, `tokensOut`, `cacheRead`, `cacheWrite`, `costUsd`, `createdAt`, `stepType?: v.string()`, `toolName?: v.optional(v.string())`
- `convex/cost/_tables.ts` — indexes `by_org_date`, `by_agent_date`, `by_thread`
- `convex/cost/queries/*` — pra dashboard M4

## Done when
- Tests verdes
- Schema já suporta breakdown por tool (usado em M4-T07)

## References
- [Plano §onStepFinish](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
