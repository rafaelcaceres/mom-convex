# [M1-T05] Slack OAuth install + callback httpActions

## Why
Onboarding do workspace Slack. Sem isso, nenhum outro step Slack funciona em multi-tenant.

## Depends on
[M0-T07] http skeleton, [M1-T01] agents, [M1-T03] slackInstalls

## Acceptance tests (write FIRST)
- `convex/slack/adapters/oauthInstall.httpAction.test.ts`
  - `GET /slack/oauth/install?orgId=X` redireciona pra `https://slack.com/oauth/v2/authorize?...` com `state` HMAC-signed (`orgId.nonce.sig`)
  - state inválido no callback → 400
  - state expirado (>10min) → 400
- `convex/slack/adapters/oauthCallback.httpAction.test.ts`
  - callback com `code` válido (MSW mock `oauth.v2.access`) cria `slackInstalls` row cifrada
  - cria agent default se org não tem nenhum
  - callback com code inválido → 400 + mensagem user-friendly
- Security: state não aceita `orgId` diferente do que iniciou (anti-CSRF)

## Implementation
- `convex/slack/adapters/oauthInstall.httpAction.ts` — gera state, redirect 302
- `convex/slack/adapters/oauthCallback.httpAction.ts` — valida state, troca code via `oauth.v2.access`, cifra token, persiste, cria default agent via `internal.agents.mutations.createAgent`
- `convex/slack/_libs/oauthState.ts` — HMAC state com `CREDS_MASTER_KEY` (ou chave dedicada)
- `convex/slack/_libs/slackClient.ts` — WebClient wrapper; injetável pra testes
- `convex/http.ts` — registrar 2 rotas
- `.env.example` — `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`
- `app/settings/slack/page.tsx` tem botão que chama `GET /slack/oauth/install?orgId=<current>` (UI virá em M1-T14)

## Done when
- Tests verdes com MSW pra Slack API
- Manual OAuth em workspace real cria install visível em `slackInstalls`
- redirect_uri documentado: `${CONVEX_SITE_URL}/slack/oauth/callback`

## References
- [Slack OAuth docs](https://api.slack.com/authentication/oauth-v2)
- [Plano §Decisões — Slack transport](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
