# [M3-T06] Domain `credentials` — cifrado + refresh schema

## Why
Armazena OAuth tokens de Gmail/Notion/etc. Nunca plaintext. Refresh schema já previsto.

## Depends on
[M0-T06] crypto, [M0-T05] tenancy

## Acceptance tests (write FIRST)
- `convex/credentials/adapters/credential.repository.test.ts`
  - `save({orgId, type:"gmail_oauth", ciphertext, refreshToken, expiresAt, scopes})` persiste
  - `getByType({orgId, type, agentId?})` retorna aggregate com `decrypt()` funcional
  - `listExpiringWithin(ms)` útil pra cron de refresh
  - security assert: plaintext não aparece no row
- `convex/credentials/domain/credential.model.test.ts`
  - `CredentialAgg.needsRefresh(thresholdMs)` true se `expiresAt - now < threshold`

## Implementation
- `convex/credentials/domain/credential.model.ts`
  - `orgId`, `agentId?: v.optional(v.id("agents"))`, `type: v.string()` (enum textual: `gmail_oauth`, `notion_oauth`, etc.), `label: v.string()`, `ciphertextB64`, `nonceB64`, `kid`, `scopes: v.array(v.string())`, `expiresAt?: v.number()`, `refreshTokenEnc?: v.object({...})`
- `convex/credentials/adapters/credential.repository.ts` — indexes `by_org_type`, `by_agent_type`
- `convex/credentials/_tables.ts`
- `convex/credentials/mutations/save.ts`, `revoke.ts` — internalMutations

## Done when
- Tests verdes
- Plaintext nunca aparece em query dumps

## References
- [Plano §Modelo de dados — credentials](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
