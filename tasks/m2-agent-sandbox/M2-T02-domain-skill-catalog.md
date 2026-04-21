# [M2-T02] Domain `skillCatalog` — static registry + seed

## Why
Catálogo de skills built-in (org-independente). Define schema Zod de args + metadata + side effect. Base para tasks M2-T03..T08.

## Depends on
[M0-T04] customFunctions

## Acceptance tests (write FIRST)
- `convex/skills/domain/skill.model.test.ts`
  - `SkillAgg.requiresConfirmation()` true se `sideEffect === "write"`
  - `SkillAgg.requiresConfirmation()` + heurística bash `rm -rf` true mesmo sem write marcado (lógica em M2-T05)
- `convex/skills/adapters/skillCatalog.repository.test.ts`
  - `getByKey("http.fetch")` retorna aggregate
  - `list()` retorna só skills com `enabled: true`
- `convex/skills/_seeds.test.ts`
  - seed idempotente: 2 runs não duplicam

## Implementation
- `convex/skills/domain/skill.model.ts` — `NewSkillCatalogModel`: `key`, `name`, `description`, `zodSchemaJson: v.string()`, `requiredCredType?`, `sideEffect: v.union(v.literal("read"), v.literal("write"))`, `enabled`
- `convex/skills/domain/skill.repository.ts`, `adapters/`
- `convex/skills/_tables.ts` — `skillCatalog` table
- `convex/skills/_seeds.ts` — seed com skills built-in (keys placeholders; impls em tasks posteriores)
- `convex/skills/_libs/zodSerialize.ts` — zod → JSON schema (via `zod-to-json-schema`)

## Done when
- Tests verdes
- `pnpm convex dev` + seed popula tabela
- Dashboard mostra catálogo

## References
- [docs/quero-explorar-mais-o-wild-papert.md §Skills registry](../docs/quero-explorar-mais-o-wild-papert.md)
