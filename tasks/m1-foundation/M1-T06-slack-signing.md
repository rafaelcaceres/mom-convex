# [M1-T06] Slack signing verification helper

## Why
Autenticar que cada webhook veio mesmo do Slack. Atacante pode forjar eventos sem esse guard.

## Depends on
[M0-T01] scaffold

## Acceptance tests (write FIRST)
- `convex/slack/_libs/verifySignature.test.ts`
  - assinatura válida → `true`
  - assinatura inválida → `false`
  - timestamp >5min velho → `false` (anti-replay)
  - assinatura com `SLACK_SIGNING_SECRET` diferente → `false`
  - fixtures: 3 requests reais capturados (sanitizados) em `test/fixtures/slack/`

## Implementation
- `convex/slack/_libs/verifySignature.ts`
  - Função pura: `verifySlackSignature({timestamp, rawBody, signature, secret}): boolean`
  - `timingSafeEqual` via WebCrypto
  - Tolerância de 5 min para clock skew
- `test/fixtures/slack/*.json` — exemplo de `event_callback`, `url_verification`, `app_mention`

## Done when
- Tests verdes
- Função exportada como pura (sem ctx) pra reutilizar em M1-T07

## References
- [Slack signing docs](https://api.slack.com/authentication/verifying-requests-from-slack)
- [docs/pi-mono/packages/mom/src/slack.ts](../docs/pi-mono/packages/mom/src/slack.ts) (referência — usa Socket Mode mas shape de event é idêntico)
