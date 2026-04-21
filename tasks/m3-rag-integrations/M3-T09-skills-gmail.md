# [M3-T09] Skills `gmail.search` + `gmail.send_draft`

## Why
Duas skills representativas: read e write. `send_draft` requer confirmação humana.

## Depends on
[M3-T07] gmail OAuth, [M2-T05] invoke, [M3-T11] (consumidor de confirmação — paralelo)

## Acceptance tests (write FIRST)
- `convex/skills/impls/gmailSearch.test.ts`
  - query `from:mario` → lista de threads com metadata
  - sem credential → retorna erro estruturado "Connect Gmail first" com link
  - token expirado → interceptor M3-T12 refresca e retry 1x
  - pagination: `limit` respeitado
- `convex/skills/impls/gmailSendDraft.test.ts`
  - chamada inicial retorna `{requireConfirmation: true, preview: {to, subject, bodySnippet}}`
  - após aprovação (via `approvals` table), impl cria draft real via Gmail API
  - reject → não cria

## Implementation
- `convex/skills/impls/gmailSearch.ts` — Zod `{query, limit}`
- `convex/skills/impls/gmailSendDraft.ts` — Zod `{to, subject, body}`
- `convex/skills/_libs/gmailClient.ts` — wrapper sobre googleapis ou fetch cru
- Registrar + seed catálogo (`sideEffect: write` em send_draft)

## Done when
- Tests verdes (MSW mock do Gmail REST)
- Live test opt-in (`LIVE_GMAIL=1`) com conta de teste

## References
- [Gmail API](https://developers.google.com/gmail/api/reference/rest)
