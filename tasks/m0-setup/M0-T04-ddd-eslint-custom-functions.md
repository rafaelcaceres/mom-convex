# [M0-T04] ESLint DDD rules + customFunctions.ts + repository base

## Why
DDD Hexagonal só funciona se as regras forem enforced. Sem ESLint, devs importam `_generated/server` e pulam camadas.

## Depends on
[M0-T01] scaffold, [M0-T03] testing infra (pra testar a factory)

## Acceptance tests (write FIRST)
- `convex/_shared/_libs/repository.test.ts`
  - `createRepository("agents")` retorna `{ get, save, delete, create }`
  - `get` retorna Aggregate (testa com aggregate fake)
  - `save` chama `ctx.db.replace`, não `patch`
  - cross-domain: `get` com id de outra tabela retorna null
- `test/eslint/ddd-rules.test.ts`
  - import de `_generated/server` em arquivo fora de `customFunctions.ts` → erro ESLint
  - import de `mutation` em arquivo fora de `mutations/` → erro
  - arquivo em `mutations/` sem `export default` → erro

## Implementation
- `convex/customFunctions.ts` — wraps `mutation`, `query`, `internalMutation`, `internalQuery`, `action`, `internalAction` com triggers registry
- `convex/_triggers.ts` — central registry (vazio por ora)
- `convex/_shared/_libs/aggregate.ts` — `interface IAggregate<T> { getModel(): T }`
- `convex/_shared/_libs/repository.ts` — `createRepository<T extends TableNames>(name)` factory + `IRepository` interface
- `eslint.config.ts` — regras `no-restricted-imports` + custom rule que bloqueia `mutation` fora de `mutations/`. Ver [~/.claude/skills/convex-ddd-architecture/eslint-rules.md]

## Done when
- Tests acima passam
- `pnpm lint` quebra com exemplos de violação (adicionar em `test/fixtures/bad-imports.ts` com `// eslint-disable-next-line` no restante)
- README menciona que `customFunctions` é obrigatório

## References
- [Skill DDD §Custom Functions](~/.claude/skills/convex-ddd-architecture/SKILL.md)
- [Skill DDD §Repositories](~/.claude/skills/convex-ddd-architecture/repositories.md)
