# [M4-T08] Audit log wrapper — quem/quando/o quê

## Why
Compliance + debugging. Toda mutation user-facing registra `{userId, orgId, mutation, args (redacted), ts}`.

## Depends on
[M0-T04] customFunctions

## Acceptance tests (write FIRST)
- `convex/auditLog/adapters/auditLog.repository.test.ts`
  - insert + query por org/user/date range
  - args redação: credentials/tokens/passwords substituídos por `"[REDACTED]"`
- `convex/_shared/_libs/withAudit.test.ts`
  - mutation wrapped registra entry automaticamente
  - mutation throws → entry com `status:"error"` e error message

## Implementation
- `convex/auditLog/domain/auditLog.model.ts` — `orgId`, `userId?`, `action: v.string()`, `argsJson: v.string()`, `status: v.union(v.literal("ok"), v.literal("error"))`, `errorMessage?`, `ts: v.number()`
- `convex/auditLog/adapters/auditLog.repository.ts` — indexes `by_org_date`, `by_user_date`
- `convex/_shared/_libs/withAudit.ts` — HOF que wrappa handler
- `convex/customFunctions.ts` — opt-in via flag em defineEntity ou aplicar em mutations user-facing

## Done when
- Tests verdes
- Dashboard admin (futuro) pode listar audit

## References
- [Plano §Auditoria](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
