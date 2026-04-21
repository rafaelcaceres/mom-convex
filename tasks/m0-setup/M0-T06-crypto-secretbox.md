# [M0-T06] Crypto lib — libsodium secretbox + fallback AES-GCM

## Why
Tokens OAuth (Slack, Gmail, Notion) nunca podem estar em plaintext no DB. Começa aqui antes de qualquer adapter externo.

## Depends on
[M0-T01] scaffold, [M0-T03] testing infra

## Acceptance tests (write FIRST)
- `convex/_shared/_libs/crypto.test.ts`
  - `encrypt(plaintext)` retorna `{ ciphertextB64, nonceB64, kid }`
  - `decrypt({ciphertextB64, nonceB64, kid})` recupera plaintext
  - `ciphertextB64 !== plaintext` (smoke)
  - `decrypt` com nonce adulterado → erro
  - 2 encrypts do mesmo plaintext produzem ciphertexts diferentes (nonce aleatório)
  - `CREDS_MASTER_KEY` ausente no env → throws informativo
- Compatibility gate: rodar `encrypt/decrypt` em contexto Convex `action` (não só Node local)

## Implementation
- `convex/_shared/_libs/crypto.ts` — try libsodium (`sodium-native` ou `libsodium-wrappers`); se `import` falha em runtime Convex, fallback AES-GCM via `globalThis.crypto.subtle`
- `kid` = key id (prep pra rotação futura). Por ora constante `"v1"`.
- `.env.example` — `CREDS_MASTER_KEY=<base64 32-byte>` + doc de como gerar: `node -e "console.log(crypto.randomBytes(32).toString('base64'))"`
- `convex/_shared/_libs/crypto.action.ts` — action dummy que importa `crypto.ts` (pra teste de runtime compatibility)

## Done when
- Tests verdes em ambos runtimes (vitest Node + Convex action via convex-test)
- Decisão documentada no arquivo: libsodium **ou** WebCrypto (qualquer que funcione)
- Helper só expõe `encrypt(plaintext: string)` / `decrypt(enc)` — nada de chaves vazando

## References
- [Plano §Risks — libsodium](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
- [Convex Node runtime compat](https://docs.convex.dev/functions/runtimes)
