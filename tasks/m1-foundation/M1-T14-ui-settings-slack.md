# [M1-T14] UI `/settings/slack` — install button + status + uninstall

## Why
Admin precisa de UI pra conectar o workspace. Sem isso, M1-T05 (OAuth) fica órfão.

## Depends on
[M1-T05] OAuth install, [M0-T05] authz (requireRole admin/owner)

## Acceptance tests (write FIRST)
- `test/e2e/settings-slack.spec.ts`
  - member comum acessa `/settings/slack` → acesso negado
  - owner vê "Connect to Slack" se `slackInstalls.listByOrg === []`
  - clique → redireciona pra `/slack/oauth/install?orgId=...`
  - após callback (mock), UI mostra `team_name` + botão "Disconnect"

## Implementation
- `app/settings/slack/page.tsx` — server component; `requireRole("owner")` em convex
- `components/settings/SlackConnectCard.tsx`
- `convex/slack/mutations/uninstall.ts` — deleta install + revoke token via `auth.revoke`
- Empty state com screenshot/preview

## Done when
- E2E verde
- Disconnect revoga token no Slack real (validar manualmente)

## References
- [Plano §M1 UI](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)

## Notas de implementação (2026-04-19)

Concluído, com desvios conscientes do spec original:

- **Tests:** não usei Playwright `test/e2e/*.spec.ts` (projeto ainda não tem config). Em vez disso:
  - `convex/slack/queries/listInstallsByOrg.test.ts` cobre unauth / non-member / owner / empty + redação do `botTokenEnc`
  - `convex/slack/mutations/uninstall.test.ts` cobre unauth / non-owner / owner deleta / install inexistente
  - `convex/slack/mutations/createInstallUrl.test.ts` atualizado com owner requirement
  - E2E no browser fica pro M1-T15 (smoke manual) — anexei guia no histórico de decisões de TASKS.md
- **Authz:** não tinha helper `requireRole`. Criei `requireOrgRole(ctx, orgId, minRole)` em `convex/auth.utils.ts` usando `tenants.checkMemberPermission` — centraliza "membro + role ≥ X". Usado em 3 endpoints Slack.
- **createInstallUrl endurecido:** antes só tinha `requireIdentity`, agora é owner-only (fechou gap deferido de M1-T05).
- **`listInstallsByOrg` retorna `SlackInstallPublicModel`** (omite `botTokenEnc`) pra o blob cifrado nunca atravessar a wire.
- **Bug V8 runtime:** `crypto.ts` + `oauthState.ts` usavam `Buffer.from(b64, "base64")` — quebrava em mutations do Convex (V8 não tem `Buffer`). Extraído `_shared/_libs/base64.ts` com `atob`/`btoa`. Afeta qualquer domain que use `CREDS_MASTER_KEY` (Slack agora, credentials em M3-T06 depois).
- **UI:** client component, não server. `SlackSettings.tsx` usa `api.tenants.getUserRoles({organizationId})` pra gate owner (retorna `Array<{role, scopeKey, scope?}>`, cuidado: não é `string[]`).
