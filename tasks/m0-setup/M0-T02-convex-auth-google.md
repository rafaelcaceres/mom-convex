# [M0-T02] Convex Auth + Google OAuth + test-login helper

## Why
Autenticação obrigatória antes de M1: todas as mutations user-facing precisam de identidade. Google como único provider no MVP.

## Depends on
[M0-T01] scaffold

## Acceptance tests (write FIRST)
- `convex/auth.test.ts`
  - mutation protegida retorna erro quando chamada sem identidade
  - mutation protegida aceita chamada com identidade fake (`t.withIdentity({ subject: "u1" })`)
- `test/e2e/auth.spec.ts` (Playwright)
  - `/` sem login redireciona (ou mostra botão Sign in)
  - login via helper faz landing em rota autenticada

## Implementation
- `convex/auth.ts` — `convexAuth({ providers: [Google] })` do `@convex-dev/auth`
- `convex/http.ts` — registrar `auth.addHttpRoutes(http)`
- `app/providers.tsx` — `ConvexAuthNextjsProvider`
- `app/middleware.ts` — proteção de rotas autenticadas
- `test/fixtures/login.ts` — helper que seta cookie de test identity (usa `convex-auth` test mode ou mock)
- `.env.example` — adicionar `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `JWT_PRIVATE_KEY`

## Done when
- Login manual via Google funciona em `pnpm dev` com creds reais
- Playwright e2e passa usando test helper (sem Google real)
- Task [M1-T11] pode usar `ctx.auth.getUserIdentity()` e retornar `{ subject }`

## References
- [Convex Auth docs](https://labs.convex.dev/auth)
- [Plano §Decisões confirmadas](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
