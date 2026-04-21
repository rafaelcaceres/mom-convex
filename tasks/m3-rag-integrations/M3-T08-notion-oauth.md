# [M3-T08] Notion OAuth flow

## Why
Segunda integração. Valida que o pattern de M3-T07 é reusável.

## Depends on
[M3-T06] credentials, [M3-T07] gmail (pattern reference)

## Acceptance tests (write FIRST)
- `convex/credentials/adapters/notionOauth.httpAction.test.ts`
  - análogo ao M3-T07: install, callback, error handling
  - Notion retorna `access_token` + `workspace_id` + `workspace_name` → persistir nos scopes/metadata
  - Notion não tem refresh token padrão (integration-level) → documentar

## Implementation
- `convex/credentials/adapters/notionOauth.httpAction.ts`
- `.env.example` — `NOTION_OAUTH_CLIENT_ID`, `NOTION_OAUTH_CLIENT_SECRET`
- Reutiliza `oauthState` helper

## Done when
- Tests verdes
- Token Notion decryptable via credential repo

## References
- [Notion OAuth](https://developers.notion.com/docs/authorization)
