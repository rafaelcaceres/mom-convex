# [M4-T05] Multi-agent routing — `+ New Agent` + binding policy

## Why
Mesma org pode ter "DevOps agent" (canal #engineering), "Support agent" (canal #support). Roteamento via binding policy.

## Depends on
[M1-T01] agents, [M1-T08] slack inbound

## Acceptance tests (write FIRST)
- `convex/agents/_libs/routeAgent.test.ts`
  - binding slack channel "C123" + policy `{channelId:"C123" → agentId:"agent_a"}` → agent_a
  - channel sem policy → agent default
  - DM sempre → agent default
  - web thread → `thread.agentId` (user escolhe ao criar)
- `test/e2e/multi-agent.spec.ts`
  - criar agent "Support" via UI → policy pra channel #support → mensagem no canal roteia correto

## Implementation
- `convex/agents/_tables.ts` — adicionar `channelRoutes: v.optional(v.record(v.string(), v.id("agents")))` no org ou em tabela separada `agentRoutes`
- Decisão: tabela separada `agentRoutes` (orgId, bindingType, bindingKey, agentId) — mais indexável
- `convex/agents/mutations/setRoute.ts`, `clearRoute.ts`
- `convex/agents/_libs/routeAgent.ts` — função pura consulta route + fallback default
- `components/agents/NewAgentDialog.tsx`

## Done when
- Tests verdes
- 2 agents mesma org, mensagens roteadas correto

## References
- [Plano §Path C personas](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
