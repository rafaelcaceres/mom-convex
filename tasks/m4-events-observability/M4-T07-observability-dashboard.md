# [M4-T07] `/observability` dashboard — cost + top threads + top tools

## Why
Visibilidade de custo é req pra launch. Reactive via queries em `costLedger`.

## Depends on
[M2-T14] costLedger, [M0-T05] authz

## Acceptance tests (write FIRST)
- `convex/cost/queries/dashboard.test.ts`
  - `costPerDay(orgId, from, to)` retorna array `[{date, usd, tokens}]`
  - `topThreads(orgId, from, to, limit)` correto
  - `topTools(orgId, from, to, limit)` correto
  - cross-tenant: org A não vê B
- `test/e2e/observability.spec.ts`
  - owner vê dashboard
  - member comum → 403
  - filter por período (7d/30d/custom)

## Implementation
- `convex/cost/queries/costPerDay.ts`, `topThreads.ts`, `topTools.ts`
- `app/observability/page.tsx` — server component + client chart (recharts)
- `components/observability/CostChart.tsx`, `TopThreadsTable.tsx`, `TopToolsTable.tsx`
- Reactive: `useQuery` atualiza ao vivo durante uso

## Done when
- E2E verde
- Dashboard coerente com dados reais

## References
- [Plano §/observability](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
