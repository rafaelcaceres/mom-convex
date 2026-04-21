# [M2-T12] Skills `sandbox.bash`, `sandbox.read`, `sandbox.write`, `sandbox.browse`

## Why
Capacidade principal do agente: executar código. Sem isso, M2 não faz "trabalho útil".

## Depends on
[M2-T11] vercel wrapper, [M2-T05] invoke

## Acceptance tests (write FIRST)
- `convex/skills/impls/sandboxBash.test.ts`
  - comando simples `ls /tmp` → stdout capturado, exit 0
  - comando com stderr → capturado, exit != 0
  - timeout 60s default
  - heurística `rm -rf /` → `requireConfirmation` (via M2-T05)
- `convex/skills/impls/sandboxRead.test.ts`
  - read de path existente → content
  - path fora de `/workspace` → erro (sandbox já isola, mas guard extra)
- `convex/skills/impls/sandboxWrite.test.ts`
  - write cria arquivo; overwrite sobrescreve
- `convex/skills/impls/sandboxBrowse.test.ts` (stub M2; real M3)
  - retorna `{note:"browse coming in M3"}` por ora — gate explícito pra não bloquear

## Implementation
- `convex/skills/impls/sandboxBash.ts` — usa `ISandboxClient.exec(cmd, {timeoutMs})`
- `convex/skills/impls/sandboxRead.ts` — `readFile(path)`
- `convex/skills/impls/sandboxWrite.ts` — `writeFile(path, content)`
- `convex/skills/impls/sandboxBrowse.ts` — stub
- Registrar todos em `skillImpls` + seed catálogo

## Done when
- Tests verdes com mocked sandbox
- Integration live: "crie /tmp/a.txt com 'hi' e mostre content" (passa em M2 smoke T19)

## References
- [Plano §Skills bootstrap](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
