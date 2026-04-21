# [M3-T13] UI `/agents/[id]/edit` aba credentials

## Why
User precisa conectar/revogar credentials por UI. Sem isso, M3-T07/T08 ficam órfãos.

## Depends on
[M3-T07] gmail, [M3-T08] notion, [M2-T17] edit page

## Acceptance tests (write FIRST)
- `test/e2e/credentials-tab.spec.ts`
  - lista types suportados: Gmail, Notion (extensível)
  - sem credential → botão "Connect Gmail" → redirect OAuth
  - com credential → mostra `label` + `scopes` + última refresh + botão Revoke
  - revoke → credential deletada + token revogado no provider

## Implementation
- `components/agents/CredentialsTab.tsx`
- `convex/credentials/queries/listForAgent.ts`
- `convex/credentials/mutations/revoke.ts` — revoga no provider via action + deleta row

## Done when
- E2E verde
- Credentials tab integrada em /agents/[id]/edit

## References
- [Plano §M3 UI](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
