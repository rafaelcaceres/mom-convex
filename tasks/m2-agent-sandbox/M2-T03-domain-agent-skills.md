# [M2-T03] Domain `agentSkills` — bindings agent × skill

## Why
Cada agent escolhe quais skills do catálogo ele tem acesso. Default é um set baseline; owner habilita extras.

## Depends on
[M1-T01] agents, [M2-T02] skillCatalog

## Acceptance tests (write FIRST)
- `convex/skills/adapters/agentSkill.repository.test.ts`
  - `enable(agentId, skillKey)` idempotente
  - `disable(agentId, skillKey)` remove binding
  - `listForAgent(agentId)` retorna só habilitadas com config
- `convex/skills/mutations/toggleSkill.test.ts`
  - auth required + requireRole admin
  - binding com skill `enabled: false` no catálogo → throws

## Implementation
- `convex/skills/domain/agentSkill.model.ts` — `agentId`, `skillKey`, `enabled`, `config?: v.object({})`, `credentialId?: v.id("credentials")`
- `convex/skills/adapters/agentSkill.repository.ts` — index `by_agent`, `by_agent_key`
- `convex/skills/mutations/toggleSkill.ts`
- `convex/skills/queries/listForAgent.ts`

## Done when
- Tests verdes
- Default agent de novo org → seed baseline (`http.fetch`, `memory.search`) via trigger no `createAgent`

## References
- [Plano §Modelo de dados — agentSkills](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
