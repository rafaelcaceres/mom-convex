# [M1-T11] Web chat mutations — createThread + sendMessage

## Why
Adapter Web paralelo ao Slack. User logado envia mensagens via mutation; UI lê reactive.

## Depends on
[M0-T02] auth, [M0-T05] tenancy, [M1-T02] threads, [M1-T09] handleIncoming

## Acceptance tests (write FIRST)
- `convex/webChat/mutations/createThread.test.ts`
  - auth required
  - cria thread com `binding: {type:"web", userId}`
  - respeita `agentId` vindo como arg (default = agent default do org)
- `convex/webChat/mutations/sendMessage.test.ts`
  - auth required
  - rejeita se thread não pertence ao user (cross-user via mesmo org pode? → não, por ora owner-only)
  - persiste user message + dispara `internal.agentRunner.handleIncoming`
- `convex/webChat/queries/myThreads.test.ts`
  - retorna threads do user logado, ordenado por última atividade

## Implementation
- `convex/webChat/mutations/createThread.ts` — usa `internal.threads.mutations.ensureThread`
- `convex/webChat/mutations/sendMessage.ts` — guard de ownership via binding.userId
- `convex/webChat/queries/myThreads.ts`, `threadMessages.ts` (re-export do componente `@convex-dev/agent` com filtro)
- Authz: todos wrapped por `requireOrgMember`

## Done when
- Tests verdes
- Playwright e2e: 2 users em orgs diferentes criam threads, não veem um ao outro

## References
- [docs/quero-explorar-mais-o-wild-papert.md §WebChatAdapter](../docs/quero-explorar-mais-o-wild-papert.md)
