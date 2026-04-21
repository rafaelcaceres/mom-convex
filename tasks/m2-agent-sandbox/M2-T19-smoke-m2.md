# [M2-T19] Smoke M2 — FizzBuzz end-to-end

## Why
Gate pra abrir M3. Valida toda a pipeline de agente real + sandbox.

## Depends on
Todos de M2.

## Acceptance tests (write FIRST)
- `test/smoke/m2.test.ts`
  - Setup: org + agent com `sandbox.bash`, `sandbox.write`, `sandbox.read`, `http.fetch`
  - Prompt: "crie `/tmp/fb.py` com FizzBuzz até 15, rode, mostre output"
  - Usar **faux provider** scripted: LLM retorna sequência de tool calls (`sandbox.write` → `sandbox.bash` → texto final com output)
  - Verificar: 1 row em `sandboxes` ativo, 3+ rows em `costLedger`, mensagem final contém `1\n2\nFizz\n...\nFizzBuzz`
- Opcional live test (`skip.if(!LIVE_ANTHROPIC && !LIVE_VERCEL)`): Anthropic Sonnet 4.5 real gera script — valida que prompt do agente guia LLM real

## Manual checklist
- [ ] `pnpm dev` + Web chat: digitar prompt FizzBuzz → output aparece streaming
- [ ] Slack real (workspace de teste): `@mom crie fizzbuzz em python e rode` → mesmo resultado
- [ ] `/threads/[id]` mostra 3 tool calls expandíveis
- [ ] `/observability` (preview em M4) mostraria custo — por ora conferir em `costLedger` via dashboard

## Done when
- Suite verde em CI (faux)
- Checklist manual completo antes de começar M3

## References
- [Plano §M2 smoke](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
