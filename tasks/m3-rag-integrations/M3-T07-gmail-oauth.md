# [M3-T07] Gmail OAuth flow — install + callback + refresh

## Why
Primeira integração "real" de skill externa. Valida pattern pra M3-T08 (Notion) e futuros.

## Depends on
[M3-T06] credentials, [M0-T07] http

## Acceptance tests (write FIRST)
- `convex/credentials/adapters/gmailOauth.httpAction.test.ts`
  - `GET /credentials/gmail/install` → redirect Google OAuth com state + scopes `gmail.readonly + gmail.send`
  - callback com `code` (MSW mock do Google token endpoint) → salva credential cifrada
  - callback com refresh_token salva `refreshTokenEnc`
  - error response → UI friendly error
- `convex/credentials/internal/refreshGmail.test.ts`
  - refresh com `refresh_token` válido → novo access_token + expiresAt atualizado
  - refresh com token revogado → credential marca `revoked:true` (novo campo opcional)

## Implementation
- `convex/credentials/adapters/gmailOauth.httpAction.ts` — 2 rotas (install, callback)
- `convex/credentials/internal/refreshGmail.ts` — internalAction
- `convex/credentials/_libs/oauthState.ts` — reutilizar helper de M1-T05
- `.env.example` — `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`

## Done when
- Tests verdes com MSW
- Manual: link de install em UI (M3-T13) gera credential real; decrypt no dashboard mostra token

## References
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2/web-server)
