# [M3-T12] Credential refresh interceptor em skills.invoke

## Why
Refresh automático antes de `expiresAt - 60s`. Sem isso, 1/N chamadas falha por token velho.

## Depends on
[M3-T06] credentials, [M3-T07] gmail refresh

## Acceptance tests (write FIRST)
- `convex/skills/_libs/credentialInterceptor.test.ts`
  - cred com `expiresAt` daqui 30s → chama refresh antes de prosseguir
  - cred válido >60s → não refresca
  - refresh fail → retorna erro estruturado "credential expired, reconnect"
  - locking: 2 calls simultâneas pra mesma cred → só 1 refresh real (test com `Promise.all`)

## Implementation
- `convex/skills/_libs/credentialInterceptor.ts` — função `ensureFreshCredential(ctx, credentialId)`
- Lock simples: refresh agarra `credentials.patch({refreshing:true})` optimistic; outros esperam ou retry
- Chamada em `skills.invoke` antes de passar credential pra impl

## Done when
- Tests verdes
- Integration: skill Gmail com token expirado → funciona sem erro user-visible

## References
- [Plano §OAuth refresh](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
