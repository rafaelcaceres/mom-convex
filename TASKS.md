# TASKS — pi-mom-on-Convex

Dashboard de progresso. Detalhes de cada task em [tasks/](tasks/README.md).

## Como usar

- Marque `[x]` quando a task estiver **100% done** (todos os testes verdes + manual checklist).
- Não marque tasks pela metade. Se algo ficou pendente, crie uma task de follow-up.
- Atualize o **Current milestone** e o **Last updated** ao fechar cada marco.
- Quando uma task bloquear (decisão pendente, bug upstream), prefixe o item com `🚧` e adicione nota no próprio arquivo da task.

## Status

- **Current milestone:** M2 — Agente real + Vercel Sandbox
- **Last updated:** 2026-04-21
- **Overall:** 27 / 62 (2 cortadas após revisão: M3-T01, M3-T03)

| Milestone | Done | Total |
|---|---|---|
| M0 — Setup & infra | 7 | 7 |
| M1 — Foundation (Slack + Web echo) | 15 | 15 |
| M2 — Agente real + Vercel Sandbox | 5 | 19 |
| M3 — RAG + integrações reais | 0 | 12 |
| M4 — Eventos + Multi-agente + Observability | 0 | 9 |

## M0 — Setup & infra

- [x] [M0-T01](tasks/m0-setup/M0-T01-scaffold-project.md) — Scaffold Next.js 15 + Convex + pnpm + Biome + CI
- [x] [M0-T02](tasks/m0-setup/M0-T02-convex-auth-google.md) — Convex Auth + Google OAuth + test-login helper
- [x] [M0-T03](tasks/m0-setup/M0-T03-testing-infra.md) — Vitest + convex-test + MSW + smoke harness
- [x] [M0-T04](tasks/m0-setup/M0-T04-ddd-eslint-custom-functions.md) — ESLint DDD rules + customFunctions.ts + repository base
- [x] [M0-T05](tasks/m0-setup/M0-T05-tenancy-authz.md) — @djpanda/convex-tenants + convex-authz + OrganizationSwitcher
- [x] [M0-T06](tasks/m0-setup/M0-T06-crypto-secretbox.md) — Crypto lib (libsodium) + CREDS_MASTER_KEY
- [x] [M0-T07](tasks/m0-setup/M0-T07-http-health.md) — convex/http.ts esqueleto + /health endpoint

**M0 done gate:** `pnpm install && pnpm dev` sobe Next + Convex; `pnpm test` verde com 3 suites dummy; CI verde em PR draft.

## M1 — Foundation: Slack + Web echo

- [x] [M1-T01](tasks/m1-foundation/M1-T01-domain-agents.md) — Domain `agents` — model, repository, CRUD
- [x] [M1-T02](tasks/m1-foundation/M1-T02-domain-threads.md) — Domain `threads` wrapper — binding union
- [x] [M1-T03](tasks/m1-foundation/M1-T03-domain-slack-installs.md) — Domain `slackInstalls` — model + encryption
- [x] [M1-T04](tasks/m1-foundation/M1-T04-slack-event-dedupe.md) — Domain `slackEventDedupe` + TTL cron cleanup
- [x] [M1-T05](tasks/m1-foundation/M1-T05-slack-oauth.md) — Slack OAuth install + callback httpActions
- [x] [M1-T06](tasks/m1-foundation/M1-T06-slack-signing.md) — Slack signing verification helper
- [x] [M1-T07](tasks/m1-foundation/M1-T07-slack-events-http.md) — Slack events httpAction
- [x] [M1-T08](tasks/m1-foundation/M1-T08-slack-inbound-normalizer.md) — Slack inbound normalizer
- [x] [M1-T09](tasks/m1-foundation/M1-T09-echo-handle-incoming.md) — `internal.agent.handleIncoming` echo
- [x] [M1-T10](tasks/m1-foundation/M1-T10-slack-outbound-mrkdwn.md) — Slack outbound + markdown→mrkdwn + split
- [x] [M1-T11](tasks/m1-foundation/M1-T11-webchat-mutations.md) — Web chat mutations (createThread + sendMessage)
- [x] [M1-T12](tasks/m1-foundation/M1-T12-ui-onboarding.md) — UI /onboarding → org + default agent
- [x] [M1-T13](tasks/m1-foundation/M1-T13-ui-chat.md) — UI /chat com useThreadMessages
- [x] [M1-T14](tasks/m1-foundation/M1-T14-ui-settings-slack.md) — UI /settings/slack — install button
- [x] [M1-T15](tasks/m1-foundation/M1-T15-smoke-m1.md) — **Smoke M1 end-to-end**

**M1 done gate:** bot Slack real + web chat respondem "echo: X"; 2 orgs isolados; dedupe funciona.

## M2 — Agente real + Vercel Sandbox

- [x] [M2-T01](tasks/m2-agent-sandbox/M2-T01-agent-component.md) — @convex-dev/agent + agentFactory + **real handleIncoming**
- [x] [M2-T02](tasks/m2-agent-sandbox/M2-T02-domain-skill-catalog.md) — Domain `skillCatalog`
- [x] [M2-T03](tasks/m2-agent-sandbox/M2-T03-domain-agent-skills.md) — Domain `agentSkills` bindings
- [x] [M2-T04](tasks/m2-agent-sandbox/M2-T04-resolve-tools-bridge.md) — resolveTools bridge → AI SDK
- [x] [M2-T05](tasks/m2-agent-sandbox/M2-T05-skills-invoke-action.md) — `internal.skills.invoke` action
- [ ] [M2-T06](tasks/m2-agent-sandbox/M2-T06-skill-http-fetch.md) — Skill `http.fetch` + SSRF guard
- [ ] [M2-T07](tasks/m2-agent-sandbox/M2-T07-domain-memory.md) — Domain `memory` + scopes
- [ ] [M2-T08](tasks/m2-agent-sandbox/M2-T08-skill-memory-search-stub.md) — Skill `memory.search` stub
- [ ] [M2-T09](tasks/m2-agent-sandbox/M2-T09-system-prompt-builder.md) — System prompt builder
- [ ] [M2-T10](tasks/m2-agent-sandbox/M2-T10-domain-sandboxes.md) — Domain `sandboxes`
- [ ] [M2-T11](tasks/m2-agent-sandbox/M2-T11-vercel-sandbox-wrapper.md) — Vercel Sandbox wrapper
- [ ] [M2-T12](tasks/m2-agent-sandbox/M2-T12-skills-sandbox.md) — Skills sandbox.* (bash/read/write/browse)
- [ ] [M2-T14](tasks/m2-agent-sandbox/M2-T14-domain-cost-ledger.md) — Domain `costLedger`
- [ ] [M2-T15](tasks/m2-agent-sandbox/M2-T15-on-step-finish-cost.md) — onStepFinish → costLedger
- [ ] [M2-T16](tasks/m2-agent-sandbox/M2-T16-sandbox-gc-cron.md) — Sandbox GC cron
- [ ] [M2-T17](tasks/m2-agent-sandbox/M2-T17-ui-agent-edit.md) — UI /agents/[id]/edit
- [ ] [M2-T18](tasks/m2-agent-sandbox/M2-T18-ui-thread-detail.md) — UI /threads/[id] — tool calls + cost
- [ ] [M2-T19](tasks/m2-agent-sandbox/M2-T19-smoke-m2.md) — **Smoke M2 FizzBuzz**

**M2 done gate:** agent roda FizzBuzz em Python no sandbox; costLedger populado; UIs de edit/detail usáveis.

## M3 — RAG + integrações reais

- [~] ~~[M3-T01](tasks/m3-rag-integrations/M3-T01-rag-component.md) — @convex-dev/rag + namespace~~ **CUT** — use `vectorIndex` nativo do Convex na tabela `memory` (M2-T07). Ver nota `2026-04-18 revisão RAG`.
- [ ] [M3-T02](tasks/m3-rag-integrations/M3-T02-memory-rag-trigger.md) — Memory → embedding trigger (via `embedMany` do componente `agent`)
- [~] ~~[M3-T03](tasks/m3-rag-integrations/M3-T03-messages-indexation.md) — Messages indexation~~ **CUT** — `@convex-dev/agent` já indexa messages automaticamente; busca via `fetchContextMessages`.
- [ ] [M3-T04](tasks/m3-rag-integrations/M3-T04-real-memory-search.md) — Memory semantic search (vectorIndex nativo + orgId filter)
- [ ] [M3-T05](tasks/m3-rag-integrations/M3-T05-rag-isolation-test.md) — **Cross-tenant isolation gate** (filtro por orgId)
- [ ] [M3-T06](tasks/m3-rag-integrations/M3-T06-domain-credentials.md) — Domain `credentials` + refresh schema
- [ ] [M3-T07](tasks/m3-rag-integrations/M3-T07-gmail-oauth.md) — Gmail OAuth flow
- [ ] [M3-T08](tasks/m3-rag-integrations/M3-T08-notion-oauth.md) — Notion OAuth flow
- [ ] [M3-T09](tasks/m3-rag-integrations/M3-T09-skills-gmail.md) — Skills gmail.search + send_draft
- [ ] [M3-T10](tasks/m3-rag-integrations/M3-T10-skill-notion-search.md) — Skill notion.search
- [ ] [M3-T11](tasks/m3-rag-integrations/M3-T11-human-in-loop.md) — Human-in-loop confirmation
- [ ] [M3-T12](tasks/m3-rag-integrations/M3-T12-credential-refresh.md) — Credential refresh interceptor
- [ ] [M3-T13](tasks/m3-rag-integrations/M3-T13-ui-credentials.md) — UI credentials tab
- [ ] [M3-T14](tasks/m3-rag-integrations/M3-T14-smoke-m3.md) — **Smoke M3**

**M3 done gate:** Gmail/Notion conectados; draft requer aprovação; isolation test verde (bloqueia merge se falhar).

## M4 — Eventos + Multi-agente + Observability

- [ ] [M4-T01](tasks/m4-events-observability/M4-T01-domain-events.md) — Domain `events` (Immediate/OneShot/Periodic)
- [ ] [M4-T02](tasks/m4-events-observability/M4-T02-events-fire-action.md) — `internal.events.fire` action
- [ ] [M4-T03](tasks/m4-events-observability/M4-T03-event-scheduling.md) — Event scheduling lifecycle
- [ ] [M4-T04](tasks/m4-events-observability/M4-T04-ui-events-crud.md) — UI events CRUD
- [ ] [M4-T05](tasks/m4-events-observability/M4-T05-multi-agent-routing.md) — Multi-agent routing per channel
- [ ] [M4-T06](tasks/m4-events-observability/M4-T06-rate-limiter.md) — Rate limiter (100 turns/h/org)
- [ ] [M4-T07](tasks/m4-events-observability/M4-T07-observability-dashboard.md) — /observability dashboard
- [ ] [M4-T08](tasks/m4-events-observability/M4-T08-audit-log.md) — Audit log wrapper
- [ ] [M4-T09](tasks/m4-events-observability/M4-T09-smoke-m4.md) — **Smoke M4**

**M4 done gate:** cron periódico dispara em produção; multi-agent route por canal; rate limit ativa; dashboard coerente.

## Tasks bloqueadas / riscos ativos

- **Live auth/tenancy validation OK (2026-04-19)** — login real via Google + fluxo `/onboarding` → `/chat` validados manualmente com echo reactive funcionando. OrganizationSwitcher UI ainda não foi exercitada (chega em M1-T14 ou depois).
- **M0-T05 spike resultado**: `@djpanda/convex-tenants@0.1.6` + `@djpanda/convex-authz@0.1.7` integram bem com `@convex-dev/auth@0.0.91`. Peer-dep exige authz `0.1.7` (não `2.x`). API do `makeTenantsAPI` não tem `createInvitation`/`declineInvitation`/`revokeInvitation` — usa `inviteMember`/`cancelInvitation`/`resendInvitation`/`acceptInvitation`. Stability: OK pra seguir. Smoke test de E2E multi-tenant (user A cria org, user B não vê) **deferido pra M1-T01** quando teremos mutations próprias chamando `checkPermission`.

## Decisões tomadas durante execução

- **M2-T05 (2026-04-21)** — `skills.invoke` dispatcher real, substituindo o stub de M2-T04. Pipeline: (1) catalog lookup → `Unknown tool` se miss; (2) **confirmation gate** — declarative write OR heurística de args perigosos (`rm -rf`, `sudo`, `curl|sh`, fork bomb, `mkfs`, `dd of=/dev/`) → `{requireConfirmation, preview}` **sem invocar impl** (wiring humano em M3-T11); (3) impl registry lookup → `Unknown tool` se não registrado; (4) dispatch dentro de `AbortController` fresh (upstream cancellation plumbing pra futuro); (5) retorna MCP-style `{content, isError}` ou preview. **Dispatcher nunca lança** — AI SDK retry de M2-T04 só serve pra falhas de infra (runAction), erros de impl viram data que o modelo lê e recupera. Helpers em `_libs/`: `confirmationHeuristics.hasDangerousArgPattern`, `errorFormatting.{redactSecrets,truncateStack,formatImplError,formatSuccess,formatUnknownSkill}`, `skillImpls.{registerSkill,getSkillImpl,_resetSkillRegistry}` (registry side-effectful; `_stubs.ts` registra todas as 6 skills com throw documentado por task alvo). Redaction cobre `sk-*`, `xox[abrps]-*`, `Bearer`, `"password"/"token"/"authorization"` JSON fields — defense-in-depth, não substitui não-logar. Audit log: `console.log(JSON.stringify({type:"skills.invoke", skillKey, status, durationMs, orgId, agentId, threadId, toolCallId, ...}))` por call — estruturado pra Convex log search; tabela durável fica pra M4-T08. **Desvio vs spec**: path é `convex/skills/actions/invoke.ts` (não `adapters/`) — segue convenção do repo (slack/actions/ vs slack/adapters/ onde adapters = HTTP/DB interfaces). Suite total 261 (28 novos: 4 registry + 9 heurística + 9 redaction + 6 dispatcher).

- **M2-T04 (2026-04-21)** — `resolveTools` bridge. Usa **`dynamicTool`** do AI SDK em vez do `tool()` sugerido na spec — o `tool()` genérico exige `INPUT`/`OUTPUT` conhecidos em dev time, mas o catálogo é runtime-only (schema vem de `zodSchemaJson`). `dynamicTool` aceita `FlexibleSchema<unknown>` e é pensado exatamente pra MCP-style tools resolvidos em runtime. `tool()` forçava a overload `<never, never>` e quebrava typecheck. Schema re-hidrata via `jsonSchema(JSON.parse(entry.zodSchemaJson))` — zero dep externa, zod-to-json → jsonSchema round-trip funciona. Split entre `buildToolSet` (puro, testável sem convex-test) e `resolveTools(ctx, scope)` (wrapper que puxa entries via `listResolvedForAgentInternal`). Retry: 1x em erro transient (heurística por substring — `timeout`/`econnreset`/`network`/`fetch failed`/`unavailable`), non-transient passa direto pra o modelo enxergar. `handleIncoming` agora resolve tools antes de `streamAssistantReply`; passa `tools` só quando há bindings (empty ToolSet viraria `tools: undefined` pra não induzir `stepCountIs` inútil). `stopWhen: stepCountIs(8)` default quando há tools — soft cap do AI SDK. Stub `internal.skills.actions.invoke.default` criado pra M2-T04 só pra `FunctionReference` compilar; corpo real vem em M2-T05 (throw explícito se alguém chamar antes). **Pitfall descoberto no smoke real (2026-04-21)**: Anthropic API rejeita tool names que não batam em `^[a-zA-Z0-9_-]{1,128}$` (400 `invalid_request_error`). Nossos keys `http.fetch`/`sandbox.bash` têm ponto — inválido. Fix: `toolNameFromSkillKey(key)` substitui char fora do alphabet por `_`, `http.fetch` → `http_fetch`. `skillKey` canônico fica na closure do execute, então o dispatcher (M2-T05) continua recebendo `"http.fetch"` regardless do que o modelo emitiu. 7 testes no buildToolSet (inclui sanitização); suite total 233.

- **M2-T03 (2026-04-21)** — Domain `agentSkills` — bindings agent × skillKey. Tabela com `orgId` **denormalizado** do agent pai pra evitar JOIN em authz/list queries; agents não trocam de org, então desnormalização é segura. Decisão: **soft-disable** (`enabled: false`) em vez de delete — `config` sobrevive a toggle off→on (test `enable re-activates a previously disabled binding and preserves config` cobre). `listForAgent` filtra por `enabled: true` via índice `by_agent_enabled`. `config` é `v.optional(v.any())` em vez de `v.object({})` da spec — cada skill define shape via `zodSchemaJson` no catálogo e `skills.invoke` (M2-T05) valida em runtime; persistência fica flexível até shapes estabilizarem. `credentialId` do spec foi **adiado pra M3-T06** (credentials table não existe ainda) — será adicionado via migration. Mutation `toggleSkill` é admin-only (`requireOrgRole(ctx, agent.orgId, "admin")`) e rejeita skill key que não esteja no catálogo OU que esteja `enabled: false` no catálogo. Trigger `seedBaselineSkillsForAgent` registrado em `convex/_triggers.ts` (não em `skills/_triggers.ts`) pra evitar **ciclo ESM**: `customFunctions.ts` importa `_triggers.ts`, então qualquer domain que chamasse `triggers.register` importaria de volta antes do export ser atribuído. Pattern: domain exporta handler puro, root file conecta via `triggers.register`. Baseline = `http.fetch` + `memory.search` (read-only, low-risk); trigger é **lenient** (skip se catalog não seedado) pra não quebrar dev deployments. 12 testes novos (6 repo + 6 mutation+query); 227 verdes no total.

- **M2-T02 (2026-04-21)** — Domain `skillCatalog` com 6 built-ins (`http.fetch`, `memory.search`, `sandbox.bash`/`read`/`write`/`browse`). Deviation vs. spec: usamos `z.toJSONSchema` **nativo do zod 4.3** em vez de instalar `zod-to-json-schema`. Razão: zod@4 já traz API built-in (`z.toJSONSchema(schema)` → JSON-schema draft 2020-12), elimina uma dep transitiva e um mapping layer. `convex/skills/_libs/zodSerialize.ts` fica como wrapper `zodToJsonSchemaString(schema)` caso a escolha mude. Seed é idempotente (`getByKey` guard em loop) — safe pra re-rodar após adicionar novas entries em `BUILT_IN_SKILLS`. Adicionado `internalMutation` `skills:mutations:seedCatalog:default` pra popular a tabela via `convex run` ou dashboard. Tests: 3 model + 3 repo + 3 seed = 9 verdes; suite total 215 verdes. **Pitfall descoberto**: `ExitPlanMode` / `pnpm lint` só reporta errors fixáveis por biome como `formaterror` silenciosos — usar `pnpm exec biome check --write convex/skills` pra auto-fix antes de commit.

- **M2-T01 landed silently durante M1 (2026-04-20)** — descoberto ao planejar M2-T01: `app.use(agent)`, `agentFactory` com cache `${orgId}:${agentId}:${modelId}`, `threadBridge` e migração do echo pra `saveMessage`/`listMessages` do componente já estavam no disco e com tests verdes (7+3 de T01, 4 de regressão em handleIncoming, 4 no smoke M1). O trabalho foi feito sob demanda durante M1-T09/T11/T13 quando o stub de `messages_stub` virou inviável — threadBridge foi a saída natural. Deviation aceita vs. spec: "useThreadMessages fakery" foi substituído por cobertura server-side (`listThreadMessages` + webChat query + smoke E2E). Hook React fica pra M2-T17/T18 se quisermos belt-and-suspenders.

- **V8 runtime base64 (2026-04-19)** — `Buffer` **não existe** no runtime V8 do Convex (só em actions Node). `crypto.ts` e `oauthState.ts` usavam `Buffer.from(b64, "base64")` e **passavam nos testes** (vitest roda em Node) mas falhavam em produção ao chamar `createInstallUrl`. Fix: extraído `convex/_shared/_libs/base64.ts` com `encodeBase64`/`decodeBase64` usando `atob`/`btoa` — web standards que funcionam nos 3 runtimes (V8, Node, Edge). Lição: testes passando em Node não garantem runtime do Convex. Regra de bolso: toda lib em `_shared` usada por mutations/queries deve evitar Node globals (`Buffer`, `process.nextTick`, `require`, etc.). Afeta qualquer lib futura que precise de base64 — reusar `_libs/base64.ts`, não escrever outro.

- **M1-T14 (2026-04-19)** — UI `/settings/slack` + backend wiring. Novo helper `requireOrgRole(ctx, orgId, minRole)` em `convex/auth.utils.ts` usa `tenants.checkMemberPermission` — centraliza o gate "membro do org + role ≥ X" e lança `"Authentication required"`/`"Forbidden"` de forma consistente. Query `listInstallsByOrg` (owner-only) retorna `SlackInstallPublicModel` (omite `botTokenEnc` — o blob cifrado nunca atravessa a wire, mesmo com camada de decrypt disponível). Mutation `uninstall` (owner-only) decripta o token antes de deletar o row e agenda `internal.slack.actions.revokeToken` para chamar `auth.revoke` fire-and-forget (erros logados, não rethrown — o token já está órfão do nosso lado). `createInstallUrl` endurecido para owner-only também (antes só exigia `requireIdentity`); deadline do M1-T05 era esse task. Frontend: `/app/settings/slack/page.tsx` (server shell) + `SlackSettings.tsx` (checa `getUserRoles({organizationId})` para decidir owner vs "access denied") + `SlackConnectCard.tsx` (botões Connect/Disconnect, banner de status vindo de `?status=` do OAuth callback). Sem e2e spec por enquanto — playwright está instalado mas sem projeto configurado; smoke manual fica pro M1-T15. **Pitfall importante** na UI: `getUserRoles` retorna `Array<{role, scopeKey, scope?}>`, não `string[]` — precisa `.some(r => r.role === "owner")`, não `.includes("owner")`.

- **M0-T06 (2026-04-18)** — Escolhido **WebCrypto AES-256-GCM** em vez de libsodium. Razão: sem deps nativas, mesmo código path em Node 22 / Edge / Convex runtime, e satisfaz o requisito do task (confidencialidade + autenticidade via GCM). Fallback mencionado no plano não foi necessário — é o caminho principal. `kid="v1"` presente para rotação futura. `convex/_shared/_libs/crypto.action.ts` (teste de runtime em ação Convex) foi **deferido**; risco baixo pois WebCrypto é spec-compliant em ambos ambientes.
- **M0-T01 (2026-04-18)** — Adicionado `docs/` e `tasks/` a `exclude` do tsconfig e `ignore` do biome. Razão: `docs/pi-mono/` é código de referência (leitura) com erros conhecidos em strict mode; `tasks/` é markdown puro. Sem isso, `pnpm typecheck` e `pnpm lint` ficavam red por ruído externo.
- **M0-T03 (2026-04-18)** — Testes Convex usam `newTest()` helper que embrulha `convexTest(schema, import.meta.glob(...))`. Retornos de `t.run(...)` devem ser dados puros (não class instances) porque Convex serializa; aggregates são reconstruídos fora de `t.run`. Também adicionado setup global MSW em `test/setup.ts` com `onUnhandledRequest: "bypass"` — testes que querem modo estrito chamam `server.use(...)` localmente.
- **M0-T04 (2026-04-18)** — `eslint.config.mjs` **consolida os selectors de 3 rules distintas em 2 blocos**, porque flat config NÃO faz merge de `no-restricted-syntax` entre blocos (último bloco vence). Solução: um bloco pra `convex/**/*.ts` menos adapters/mutations/queries (com ctx.db + mutation() selectors), outro bloco pra mutations/queries (com ctx.db + named-export selector). `convex/_shared/_libs/repository.ts` é o único arquivo fora de `adapters/` que pode chamar `ctx.db.*` — adicionado aos ignores. `save()` no factory usa cast `as any` local porque Convex não consegue inferir shape exato de `Doc<TTable>` genérico.
- **M0-T07 (2026-04-18)** — `convex/_shared/adapters/health.httpAction.ts` importa `httpAction` direto de `_generated/server`. Isso não viola a rule 1 da ESLint (que só restringe `mutation`/`query`/`action` + variantes internas, não `httpAction`). HTTP actions vivem fora da camada de triggers por design (handlers HTTP são inherentemente out-of-band).
- **M0-T02 (2026-04-18)** — Providers do Google OAuth e Convex Auth escritos sem pre-config de secrets; `convexAuth({providers: [Google]})` funciona em dev mesmo sem `AUTH_GOOGLE_ID` contanto que ninguém chame o fluxo OAuth real. Helper `requireIdentity(ctx)` em `convex/auth.utils.ts` é a API pública que toda mutation user-facing deve chamar. Middleware `middleware.ts` redireciona rotas não-públicas para `/`. Schema compõe `...authTables` de `@convex-dev/auth/server`.
- **M0-T03 (correção 2026-04-18)** — Mover declaração `ImportMeta.glob` de arquivo `.d.ts` separado para `declare global` inline em `test/_helpers/convex.ts`. Razão: convex codegen rodava typecheck em todo `**/*.ts` e não pegava o `.d.ts` ambient isolado; com `declare global` embebido no arquivo que usa, o TS sempre resolve corretamente.
- **M0-T05 (2026-04-18)** — Stack `@djpanda/convex-tenants` + `@djpanda/convex-authz` wired via `convex/convex.config.ts` + `convex/authz.ts` (com `TENANTS_PERMISSIONS`/`TENANTS_ROLES` como base) + `convex/tenants.ts` (re-exporta do `makeTenantsAPI`). `auth` resolver usa `getAuthUserId` do Convex Auth. Role default do criador: `"owner"`.
- **M1-T07 (2026-04-18)** — `POST /slack/events` httpAction. Fluxo: signing verify → url_verification challenge (early return) → dedupe `recordOrSkipEvent` → resolve teamId→install (internalQuery `resolveInstallByTeamId`) → `scheduler.runAfter(0, handleIncomingEvent)` stub. Retorna 200 em todo caminho válido. Stub de `handleIncomingEvent` em `slack/actions/` — M1-T08 põe o normalizer real. **Upgrade forçado convex-test 0.0.35→0.0.49** pra corrigir "Write outside of transaction" em scheduler; 0.0.49 também é mais rigoroso em validators (uniões exigem Id real, não placeholder string — ajustado teste de ensureThread pra inserir user real).
- **M1-T05/T06 (2026-04-18)** — OAuth Slack. Signing (T06) é função pura com HMAC-SHA256 via WebCrypto, janela de ±5min anti-replay, constant-time hex compare. 8 tests cobrem timestamp fora de janela, chave errada, formato inválido. OAuth (T05) ficou em 4 arquivos: `mutations/createInstallUrl.ts` (auth-protected, retorna URL pro redirect), `adapters/oauthCallback.httpAction.ts` (verify state → exchange code → runMutation persistInstall → 302 pra `SITE_URL/settings/slack?status=...`), `_libs/oauthState.ts` (HMAC com `CREDS_MASTER_KEY`, TTL 10min), `_libs/slackClient.ts` (fetch direto pra `oauth.v2.access`, mockável via MSW). Token bot é sempre cifrado antes de persistir (via `encrypt()` no `persistInstall` mutation). Decisão: nenhum httpAction `/slack/oauth/install` — o frontend pede URL via mutation (auth checada) e redireciona. Authz de membership no `orgId` fica pra M1-T14 quando UI Settings Slack for ligada ao `checkMemberPermission` do `@djpanda/convex-tenants`.
- **Revisão RAG (2026-04-18)** — Depois de inspecionar `@convex-dev/agent@0.6.1` (`node_modules/@convex-dev/agent/src/component/schema.ts` + `dist/client/index.d.ts`), constatado que o componente **já traz**: `messages` persistidas + `embeddings_128..4096` + `fetchContextMessages(ctx, component, {searchText, userId, threadId})` (hybrid text+vector). Isso dispensa `@convex-dev/rag` pra busca em histórico. Para `memory` (nossa tabela própria de fatos long-lived), usamos `vectorIndex` **nativo do Convex** (`defineTable(...).vectorIndex(...)`) — simpler que puxar outro componente. **Cut tasks**: M3-T01 (`@convex-dev/rag` install) e M3-T03 (messages indexation scheduler). **Mantidas**: M3-T02 (trigger pra gerar embedding ao gravar memory, via `embedMany` do componente agent), M3-T04 (memory.search usando vector search nativo com filtro `orgId`), M3-T05 (isolation test). Componente tem tabela `memories` própria mas **sem API client pública** em 0.6.1 — confirmado. Total de tasks cai de 64 → 62.
- **M1-T04 (2026-04-18)** — Domain `slackEventDedupe` + cron horário. `recordOrSkip(eventId, now)` no repo é atômico: checa `by_eventId` index e insere, retornando `"recorded"`/`"duplicate"`. TTL default 24h (muito acima da janela de retry do Slack de ~1h). `clearExpired` usa `.take(batchSize=500)` — cron horário sweep incremental; se houver mais rows, próxima hora cleans the rest. Internal mutation `recordOrSkipEvent` fica em `mutations/` (não `internal/`) por convenção DDD (ESLint rule 3). Cron `slack:cleanExpiredDedupe` registrado em `convex/crons.ts` com `{hours: 1}` interval. Index `by_seenAt` adicionado pra scan eficiente do cleanup.
- **M1-T03 (2026-04-18)** — Domain `slackInstalls` com bot token **sempre cifrado em repouso**. `SlackInstallAgg.decryptBotToken()` é o único caminho pra plaintext — chamável só dentro de adapter actions que precisam falar com Slack Web API. Repositório tem `upsertByTeamId` pra reinstalações OAuth (mesmo `teamId` → substitui token+metadata, mantém row). Index `by_teamId` (lookup), `by_org` (list). Security test assert: `JSON.stringify(doc)` não contém plaintext. `EncryptedBlobModel` é exportado pra reuso em `credentials` (M3-T06).
- **M1-T02 (2026-04-18)** — Domain `threads` wrapper completo. `AdapterBindingModel` é union discriminada (slack/web/event); `bindingKey(binding)` é função pura que serializa canonicamente (ex: `"slack:si_1:C123:1234.567"`, `"web:users:abc"`, `"event:evt_1"`). Schema usa **campo denormalizado `bindingKey: v.string()`** pra ter 1 único index `by_org_binding` que cobre todos os tipos — indexar a union nativamente seria múltiplos indexes com optional paths. `ensureThread` é `internalMutation` idempotente: dado (orgId, agentId, binding) retorna thread existente (same key) ou cria nova. `agentThreadId` é placeholder `"pending:<ts>:<rand>"` em M1 — M2-T01 vai apontar pro id interno do componente `@convex-dev/agent`.
- **M1-T01 (2026-04-18)** — Domain `agents` completo: `NewAgentModel`+`AgentModel` validators, `AgentAgg` com `markAsDefault`/`unmarkDefault`/`updateSystemPrompt`, `AgentRepository` com `byOrgSlug`/`listByOrg`/`findDefault`. Mutations `createAgent` (primeiro agente do org vira default automaticamente, slug único por org), `setDefault` (demota o anterior), `updateSystemPrompt` (aggregate valida non-empty). Queries `listByOrg`/`getById`/`getDefault`. `orgId` é `v.string()` (opaco — referencia o id interno do componente `@djpanda/convex-tenants`). Auth via `requireIdentity` em toda mutation/query user-facing; authz de org-membership deferida pra M1-T11/T12 quando o fluxo de UI acionar `checkMemberPermission`. Workflow: após mudar schema é preciso rodar `pnpm exec convex dev --once --typecheck=disable` pra regenerar `_generated/dataModel.d.ts` com o novo table shape. 28 testes no domínio (model 6 + repo 7 + createAgent 5 + listByOrg 3 + setDefault 4 + updateSystemPrompt 3).
