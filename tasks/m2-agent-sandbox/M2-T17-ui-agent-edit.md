# [M2-T17] UI `/agents/[id]/edit` — prompt, model, memory, skills

## Why
Owner configura agente sem tocar banco. Sem UI, M2 não é usável.

## Depends on
[M1-T01] agents, [M2-T03] agentSkills, [M2-T07] memory

## Acceptance tests (write FIRST)
- `test/e2e/agent-edit.spec.ts`
  - editar `systemPrompt` + save → próxima mensagem usa prompt novo
  - toggle skill `sandbox.bash` off → agente não tem mais acesso (test via faux model que tenta chamar)
  - editar memória `alwaysOn=true` → aparece no prompt de próximo turn
  - non-admin → read-only

## Implementation
- `app/agents/[id]/edit/page.tsx` — server component com auth guard
- `components/agents/PromptEditor.tsx` — textarea com contagem
- `components/agents/MemoryEditor.tsx` — markdown editor (CodeMirror? Textarea simples OK)
- `components/agents/SkillsToggle.tsx` — lista catálogo + toggle por agentSkill
- `components/agents/ModelSelector.tsx` — dropdown de modelIds suportados
- Reusa `queries/getById.ts`, `mutations/updateSystemPrompt.ts`, etc.

## Done when
- E2E verde (4 cases)
- Tailwind v4 + shadcn consistente

## References
- [Plano §M2 UI](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
