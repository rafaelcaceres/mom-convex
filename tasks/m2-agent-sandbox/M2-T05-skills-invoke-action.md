# [M2-T05] `internal.skills.invoke` action — dispatch + error handling

## Why
Único ponto de execução de skills. Isola retry, logging, credential resolve, heurísticas de confirmação. Tools do AI SDK nunca rodam lógica própria — só chamam invoke.

## Depends on
[M2-T02] catalog, [M2-T03] agentSkills, [M2-T04] bridge

## Acceptance tests (write FIRST)
- `convex/skills/adapters/invoke.action.test.ts`
  - skill key desconhecida → `{content: [{type:"text", text:"Unknown tool: ..."}], isError: true}` (não throw)
  - skill existente chama impl registrada em `skillImpls` map
  - impl error → retorna erro estruturado com stack truncado (sem vazar secrets)
  - heurística de confirmação: `sideEffect="write"` + args text matching `rm -rf|sudo|curl.*sh` → retorna `{requireConfirmation:true, preview}` (stub; wiring real em M3-T11)
  - `AbortSignal` propagado pra impl
  - Every call produz audit log entry

## Implementation
- `convex/skills/adapters/invoke.action.ts` — internalAction
- `convex/skills/_libs/skillImpls.ts` — registry `Map<key, SkillImpl>`. Cada skill fica num módulo separado (`skills/impls/httpFetch.ts`, etc.)
- `convex/skills/_libs/confirmationHeuristics.ts` — regex match para patterns perigosos
- Retry: AI SDK já retry via tool.execute thrown; aqui retornamos erro estruturado em vez de throw

## Done when
- Tests verdes (6+ cases)
- Logs estruturados em Convex com `{skillKey, durationMs, status}`

## References
- [docs/quero-explorar-mais-o-wild-papert.md §Bridge pro AI SDK](../docs/quero-explorar-mais-o-wild-papert.md)
