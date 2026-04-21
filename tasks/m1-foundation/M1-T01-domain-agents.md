# [M1-T01] Domain `agents` — model, repository, CRUD

## Why
Agent é a unidade central de configuração (prompt, model, skills bindings). Precisa existir antes de qualquer thread ou runtime.

## Depends on
[M0-T04] customFunctions, [M0-T05] tenancy

## Acceptance tests (write FIRST)
- `convex/agents/domain/agent.model.test.ts` (unit)
  - `AgentAgg.markAsDefault()` altera `isDefault`
  - `AgentAgg.markAsDefault()` em agente já default é no-op
- `convex/agents/adapters/agent.repository.test.ts`
  - `create({ orgId, slug, ... })` persiste com `isDefault=false` se já existe default
  - `byOrgSlug({ orgId, slug })` retorna agregate; slug deve ser único por org
  - `listByOrg({ orgId })` retorna só os da org
  - `findDefault({ orgId })` retorna o marcado `isDefault=true`
- `convex/agents/mutations/createAgent.test.ts`
  - auth required
  - usa `NewAgentModel.pick(...)` pra args (não duplica fields)
- `convex/agents/queries/listByOrg.test.ts`
  - retorna apenas agentes do org do user autenticado

## Implementation
- `convex/agents/domain/agent.model.ts`
  - `NewAgentModel` (no system fields): `orgId`, `slug`, `name`, `systemPrompt`, `modelId`, `modelProvider`, `isDefault`, `toolsAllowlist: v.array(v.string())`
  - `AgentModel` (com system fields)
  - `AgentAgg implements IAggregate<Agent>`
- `convex/agents/domain/agent.repository.ts` — interface `IAgentRepository extends IRepository<"agents">` + `byOrgSlug`, `listByOrg`, `findDefault`
- `convex/agents/adapters/agent.repository.ts` — impl com indexes `by_org`, `by_org_slug`
- `convex/agents/_tables.ts` — `defineTable(NewAgentModel.fields).index(...)`
- `convex/agents/mutations/createAgent.ts`, `setDefault.ts`, `updateSystemPrompt.ts`
- `convex/agents/queries/listByOrg.ts`, `getById.ts`, `getDefault.ts`
- `convex/schema.ts` — compor `agentTables`

## Done when
- Tests verdes
- Criar agent via Convex dashboard valida shape
- Cross-tenant query não vaza (assert explícito)

## References
- [Skill DDD §Domain Models](~/.claude/skills/convex-ddd-architecture/domain-models.md)
- [Plano §Modelo de dados](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
