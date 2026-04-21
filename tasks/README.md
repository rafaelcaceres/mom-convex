# tasks/ — backlog executável do pi-mom-on-Convex

Este diretório é o backlog granular do projeto, gerado a partir do plano em [~/.claude/plans/a-pasta-docs-tem-shiny-scone.md](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md) e dos documentos em [../docs/](../docs/).

## Como usar

1. Escolha a próxima task pendente na ordem do milestone atual (M0 → M1 → M2 → M3 → M4).
2. Respeite `Depends on` — não pule dependências.
3. **Escreva o arquivo de teste primeiro** (commit inicial da task). Confirme que roda e falha ("RED").
4. Implemente o mínimo para o teste passar ("GREEN").
5. Refatore se necessário, garantindo que todos os testes seguem verdes.
6. Marque a task como concluída mudando o título para `# [DONE] [M1-T07] ...` (ou deletando o arquivo se preferir git-log como fonte de verdade).

## Convenções

- **DDD Hexagonal** — siga [~/.claude/skills/convex-ddd-architecture/SKILL.md](~/.claude/skills/convex-ddd-architecture/SKILL.md).
- **Imports** — sempre `customFunctions.ts`, nunca `_generated/server`.
- **Um arquivo por função** — `mutations/createAgent.ts` com `export default`.
- **Thin `_tables.ts`** — apenas `defineTable(NewXModel.fields)`. Shape vive no `domain/*.model.ts`.
- **TDD estrito** — arquivo de teste é o primeiro diff da task.
- **Mocks de externals** — Slack WebClient, Vercel Sandbox, Gmail, Notion: interfaces + mocks. Zero calls reais em CI. 1 integration test por external com `skip.if(!process.env.LIVE)` pra validação manual.
- **LLM em testes** — usar faux provider do AI SDK (`@ai-sdk/provider-utils` mocks). Nunca gastar tokens.
- **Sem commits grandes** — se uma task exige >3 arquivos de código, split.

## Template de task

```markdown
# [M<n>-T<nn>] Título curto e imperativo

## Why
1-2 frases. Qual capability? Qual marco?

## Depends on
[M<n>-T<nn>] Título, ...

## Acceptance tests (write FIRST)
- `<caminho>/<arquivo>.test.ts`
  - caso 1 (descritivo)
  - caso 2
  - edge case

## Implementation
- `<caminho>/<arquivo>.ts` — breve descrição
- `<outro>` — ...

## Done when
- All listed tests green
- `pnpm lint` clean
- (se aplicável) Manual: passo concreto de smoke

## References
- [plano](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
- [docs/quero-explorar-mais-o-wild-papert.md §seção](../docs/quero-explorar-mais-o-wild-papert.md)
- [docs/pi-mono/packages/mom/src/arquivo.ts:Lx-Ly](../docs/pi-mono/packages/mom/src/arquivo.ts)
```

## Índice

### M0 — Setup & infra
- [M0-T01 — Scaffold Next.js + Convex + CI](m0-setup/M0-T01-scaffold-project.md)
- [M0-T02 — Convex Auth + Google OAuth](m0-setup/M0-T02-convex-auth-google.md)
- [M0-T03 — Vitest + convex-test + MSW](m0-setup/M0-T03-testing-infra.md)
- [M0-T04 — ESLint DDD + customFunctions + repo base](m0-setup/M0-T04-ddd-eslint-custom-functions.md)
- [M0-T05 — convex-tenants + convex-authz + OrganizationSwitcher](m0-setup/M0-T05-tenancy-authz.md)
- [M0-T06 — Crypto lib (libsodium) + CREDS_MASTER_KEY](m0-setup/M0-T06-crypto-secretbox.md)
- [M0-T07 — http.ts + /health endpoint](m0-setup/M0-T07-http-health.md)

### M1 — Foundation: Slack + Web echo
- [M1-T01 — Domain agents](m1-foundation/M1-T01-domain-agents.md)
- [M1-T02 — Domain threads (wrapper)](m1-foundation/M1-T02-domain-threads.md)
- [M1-T03 — Domain slackInstalls](m1-foundation/M1-T03-domain-slack-installs.md)
- [M1-T04 — Domain slackEventDedupe + TTL cron](m1-foundation/M1-T04-slack-event-dedupe.md)
- [M1-T05 — Slack OAuth install + callback](m1-foundation/M1-T05-slack-oauth.md)
- [M1-T06 — Slack signing verification](m1-foundation/M1-T06-slack-signing.md)
- [M1-T07 — Slack events httpAction](m1-foundation/M1-T07-slack-events-http.md)
- [M1-T08 — Slack inbound normalizer](m1-foundation/M1-T08-slack-inbound-normalizer.md)
- [M1-T09 — Echo agent handleIncoming](m1-foundation/M1-T09-echo-handle-incoming.md)
- [M1-T10 — Slack outbound + mrkdwn](m1-foundation/M1-T10-slack-outbound-mrkdwn.md)
- [M1-T11 — Web chat mutations](m1-foundation/M1-T11-webchat-mutations.md)
- [M1-T12 — UI /onboarding](m1-foundation/M1-T12-ui-onboarding.md)
- [M1-T13 — UI /chat com useThreadMessages](m1-foundation/M1-T13-ui-chat.md)
- [M1-T14 — UI /settings/slack](m1-foundation/M1-T14-ui-settings-slack.md)
- [M1-T15 — Smoke M1 end-to-end](m1-foundation/M1-T15-smoke-m1.md)

### M2 — Agente real + Vercel Sandbox
- [M2-T01 — @convex-dev/agent + factory + **real handleIncoming**](m2-agent-sandbox/M2-T01-agent-component.md)
- [M2-T02 — Domain skillCatalog](m2-agent-sandbox/M2-T02-domain-skill-catalog.md)
- [M2-T03 — Domain agentSkills bindings](m2-agent-sandbox/M2-T03-domain-agent-skills.md)
- [M2-T04 — resolveTools bridge](m2-agent-sandbox/M2-T04-resolve-tools-bridge.md)
- [M2-T05 — skills.invoke action](m2-agent-sandbox/M2-T05-skills-invoke-action.md)
- [M2-T06 — Skill http.fetch](m2-agent-sandbox/M2-T06-skill-http-fetch.md)
- [M2-T07 — Domain memory](m2-agent-sandbox/M2-T07-domain-memory.md)
- [M2-T08 — Skill memory.search stub](m2-agent-sandbox/M2-T08-skill-memory-search-stub.md)
- [M2-T09 — System prompt builder](m2-agent-sandbox/M2-T09-system-prompt-builder.md)
- [M2-T10 — Domain sandboxes](m2-agent-sandbox/M2-T10-domain-sandboxes.md)
- [M2-T11 — Vercel Sandbox wrapper](m2-agent-sandbox/M2-T11-vercel-sandbox-wrapper.md)
- [M2-T12 — Skills sandbox.*](m2-agent-sandbox/M2-T12-skills-sandbox.md)
- [M2-T14 — Domain costLedger](m2-agent-sandbox/M2-T14-domain-cost-ledger.md)
- [M2-T15 — onStepFinish → costLedger](m2-agent-sandbox/M2-T15-on-step-finish-cost.md)
- [M2-T16 — Sandbox GC cron](m2-agent-sandbox/M2-T16-sandbox-gc-cron.md)
- [M2-T17 — UI /agents/[id]/edit](m2-agent-sandbox/M2-T17-ui-agent-edit.md)
- [M2-T18 — UI /threads/[id] detail](m2-agent-sandbox/M2-T18-ui-thread-detail.md)
- [M2-T19 — Smoke M2 FizzBuzz](m2-agent-sandbox/M2-T19-smoke-m2.md)

### M3 — RAG + integrações reais
- [M3-T01 — @convex-dev/rag setup](m3-rag-integrations/M3-T01-rag-component.md)
- [M3-T02 — Memory → RAG trigger](m3-rag-integrations/M3-T02-memory-rag-trigger.md)
- [M3-T03 — Messages indexation scheduler](m3-rag-integrations/M3-T03-messages-indexation.md)
- [M3-T04 — Real memory.search](m3-rag-integrations/M3-T04-real-memory-search.md)
- [M3-T05 — Cross-tenant RAG isolation test](m3-rag-integrations/M3-T05-rag-isolation-test.md)
- [M3-T06 — Domain credentials + refresh](m3-rag-integrations/M3-T06-domain-credentials.md)
- [M3-T07 — Gmail OAuth flow](m3-rag-integrations/M3-T07-gmail-oauth.md)
- [M3-T08 — Notion OAuth flow](m3-rag-integrations/M3-T08-notion-oauth.md)
- [M3-T09 — Skills gmail.search + send_draft](m3-rag-integrations/M3-T09-skills-gmail.md)
- [M3-T10 — Skill notion.search](m3-rag-integrations/M3-T10-skill-notion-search.md)
- [M3-T11 — Human-in-loop confirmation](m3-rag-integrations/M3-T11-human-in-loop.md)
- [M3-T12 — Credential refresh interceptor](m3-rag-integrations/M3-T12-credential-refresh.md)
- [M3-T13 — UI credentials tab](m3-rag-integrations/M3-T13-ui-credentials.md)
- [M3-T14 — Smoke M3](m3-rag-integrations/M3-T14-smoke-m3.md)

### M4 — Eventos + Multi-agente + Observability
- [M4-T01 — Domain events](m4-events-observability/M4-T01-domain-events.md)
- [M4-T02 — internal.events.fire action](m4-events-observability/M4-T02-events-fire-action.md)
- [M4-T03 — Event scheduling lifecycle](m4-events-observability/M4-T03-event-scheduling.md)
- [M4-T04 — UI events CRUD](m4-events-observability/M4-T04-ui-events-crud.md)
- [M4-T05 — Multi-agent routing](m4-events-observability/M4-T05-multi-agent-routing.md)
- [M4-T06 — Rate limiter](m4-events-observability/M4-T06-rate-limiter.md)
- [M4-T07 — /observability dashboard](m4-events-observability/M4-T07-observability-dashboard.md)
- [M4-T08 — Audit log wrapper](m4-events-observability/M4-T08-audit-log.md)
- [M4-T09 — Smoke M4](m4-events-observability/M4-T09-smoke-m4.md)
