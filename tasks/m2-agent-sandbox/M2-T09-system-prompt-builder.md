# [M2-T09] System prompt builder — dinâmico por thread

## Why
Prompt carrega contexto: memórias alwaysOn + users visíveis + channels + skills disponíveis + agent-specific systemPrompt. Plataforma-agnóstico (markdown padrão).

**Substitui** o passthrough trivial de [M2-T01](M2-T01-agent-component.md) (que usa `agent.systemPrompt` raw). O `agentFactory` passa a invocar este builder antes de instanciar o `Agent`. Manual smoke com IA real pra validar que o contexto injetado melhora respostas.

## Depends on
[M1-T01] agents, [M2-T03] agentSkills, [M2-T07] memory, [M2-T08] memory.search

## Acceptance tests (write FIRST)
- `convex/agents/_libs/systemPrompt.test.ts`
  - snapshot test: prompt estável pra fixtures conhecidas
  - inclui `agent.systemPrompt` no topo
  - lista skills habilitadas com descrição
  - inclui memórias alwaysOn ordenadas por scope (org → agent → thread)
  - cap de ~10k chars memórias (trunca + warning)
  - sem menção a Slack/Discord (platform-agnostic check)

## Implementation
- `convex/agents/_libs/systemPrompt.ts` — função pura:
  ```
  buildSystemPrompt({ agent, memories, users, channels, skills }): string
  ```
- Template em markdown com seções `## Users`, `## Channels`, `## Tools`, `## Memory`
- Exportar também truncated version (priorizar alwaysOn mais recentes)

## Done when
- Snapshot test verde
- Tamanho típico <20k chars
- Usado no `agentFactory.ts` ao instanciar Agent

## References
- [docs/new.md §System Prompt Changes](../docs/new.md)
- [docs/pi-mono/packages/mom/src/agent.ts:69-220](../docs/pi-mono/packages/mom/src/agent.ts)
