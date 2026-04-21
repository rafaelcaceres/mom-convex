# [M1-T15] Smoke M1 end-to-end

## Why
Validação que M1 está fechado antes de abrir M2. Teste cobre: install Slack + Web chat + isolamento cross-org.

## Depends on
Todos de M1.

## Acceptance tests (write FIRST)
- `test/smoke/m1.test.ts` — ✅ implementado
  - Setup: 2 orgs (A, B), cada uma com 1 user + 1 agent default (helper `seedOrgWithAgent`)
  - **Web chat isolation**: user A envia "oi" em thread A → user A lê `[user "oi", assistant "echo: oi"]`, thread de user B permanece vazio
  - **Slack echo**: POST assinado `/slack/events` (app_mention) → `chat.postMessage` recebe `text: "echo: hi"` e `thread_ts` preservado (MSW capture)
  - **Cross-tenant**: user B tentando `listMessages` / `sendMessage` no thread A → `Forbidden`
  - **Dedupe**: mesmo `event_id` 2x → segundo retorna `{ deduped: true }` e MSW só vê 1 `chat.postMessage`
  - Runtime: ~250ms (<<30s)
  - **Nota importante**: usa `vi.useFakeTimers()` + `t.finishAllScheduledFunctions(vi.runAllTimers)` — com timers reais o scheduler do Convex não drena. `toFake` exclui `performance`/`nextTick` pra MSW continuar operando. `signedHeaders` usa `performance.timeOrigin + performance.now()` pra escapar do Date mockado e ficar dentro da janela ±5min do Slack.

## Como rodar
- `pnpm test:smoke` — roda só `test/smoke/**`
- `pnpm test` — roda a suite inteira (smoke incluso via `include` do vitest.config.ts)

## Manual checklist (antes de abrir M2)
- [ ] Install Slack real em workspace de teste → bot responde `@mom oi` → `echo: oi`
- [ ] `/chat` no browser: 2 abas com o mesmo user mostram a mesma thread (1-thread-per-user em M1); 2 usuários distintos veem threads isoladas
- [ ] Convex dashboard: tabelas `threads`, `slackInstalls`, `slackEventDedupe`, `agents` sem órfãos após sessão de teste
- [ ] Install Slack em segundo workspace (org B) → eventos de B não vazam pro thread de A

## Done when
- Suite verde em CI ✅ (4/4 tests, ~250ms)
- Checklist manual verde antes de começar M2

## References
- [Plano §M1 smoke](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
