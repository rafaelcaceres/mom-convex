# [M0-T05] @djpanda/convex-tenants + convex-authz + OrganizationSwitcher

## Why
Multi-tenancy via componente pronto. Toda tabela do domínio vai ter `orgId` derivado da membership atual. Authz centraliza permissões (roles: owner/admin/member).

**Spike gate**: validar estabilidade da API do `@djpanda/convex-tenants`. Se quebrar ou faltar cobertura, fallback pra tabelas próprias (`orgs`, `members`) custa ~3d.

## Depends on
[M0-T02] auth, [M0-T04] customFunctions

## Acceptance tests (write FIRST)
- `convex/tenancy/tenancy.test.ts`
  - signup novo user → cria org default + member(role=owner)
  - user A em org X não vê dados de org Y (via query helper `listForCurrentOrg`)
  - `requireRole("admin")` bloqueia member comum
- `test/e2e/org-switcher.spec.ts` (Playwright)
  - criar 2 orgs, switcher muda context, listas atualizam

## Implementation
- `convex.config.ts` — `app.use(tenants)`, `app.use(authz)`
- `convex/tenancy/_libs/policies.ts` — `requireRole(ctx, role)`, `requireOrgMember(ctx, orgId)`
- `convex/tenancy/queries/getCurrentMembership.ts`
- `app/(authed)/org-switcher.tsx` — wrap do `OrganizationSwitcher` do componente
- Define roles: `owner`, `admin`, `member` em `convex/authz.ts`

## Done when
- Tests acima verdes
- Cross-org query sempre filtra por `orgId` via helper
- Escrever nota no README: "se API do convex-tenants mudar, ver task M0-T05 pra pontos de desacoplamento"

## References
- [Plano §Auth & segurança](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
- [@djpanda/convex-tenants](https://www.npmjs.com/package/@djpanda/convex-tenants)
- [@djpanda/convex-authz](https://www.npmjs.com/package/@djpanda/convex-authz)
