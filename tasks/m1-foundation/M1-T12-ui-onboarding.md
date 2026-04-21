# [M1-T12] UI `/onboarding` — signup → org + default agent → `/chat`

## Why
User recém-logado não tem org nem agent. Onboarding guia em 1 página.

## Depends on
[M0-T02] auth, [M0-T05] tenancy, [M1-T01] agents

## Acceptance tests (write FIRST)
- `test/e2e/onboarding.spec.ts`
  - novo user loga via Google (mock) → redirecionado pra `/onboarding`
  - input de nome de org + submit → org + default agent criados, redireciona `/chat`
  - user com org existente acessando `/onboarding` → redirect `/chat`
- `convex/tenancy/mutations/completeOnboarding.test.ts`
  - cria org, member(owner), agent default em 1 transação
  - idempotente (2 chamadas = 1 org)

## Implementation
- `app/onboarding/page.tsx` — server component que checa membership, form client
- `convex/tenancy/mutations/completeOnboarding.ts` — cria org → member → chama `internal.agents.mutations.createAgent` com `isDefault: true`
- Shadcn button + input + toast pra errors
- Skip se já tem membership

## Done when
- E2E verde
- Novo user chega em `/chat` com agent default funcional (envia "oi" → echo via M1-T09)

## References
- [Plano §M1 — Foundation](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
