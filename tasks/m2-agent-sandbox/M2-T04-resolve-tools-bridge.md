# [M2-T04] resolveTools bridge — skills → AI SDK tool array

## Why
`@convex-dev/agent` consome `tools: ToolSet` do AI SDK. Bridge transforma bindings habilitados em tool objects com `execute` que delega a `internal.skills.invoke`.

Esta task **enriquece** o `agent.streamText` já rodando de [M2-T01](M2-T01-agent-component.md) (que nasce sem tools): adiciona o array de tools + `stopWhen: stepCountIs(8)` no call site. Manual smoke deve rodar contra IA real pra confirmar que o LLM escolhe tools corretamente.

## Depends on
[M2-T02] catalog, [M2-T03] agentSkills

## Acceptance tests (write FIRST)
- `convex/skills/_libs/resolveTools.test.ts`
  - retorna tool por skill habilitada; tool.description = skill.description
  - zod schema reidrata corretamente do JSON armazenado
  - tool.execute chama `ctx.runAction(internal.skills.invoke.default, ...)` com skillKey + args
  - retry de 1x em erro transient (test com mock que falha 1ª vez)

## Implementation
- `convex/skills/_libs/resolveTools.ts` — função: `async resolveTools(ctx, agentId): Promise<ToolSet>`
- Usa `tool({description, parameters, execute})` do `ai` (AI SDK)
- `execute` passa `threadId` via closure (recebido do call site)

## Done when
- Tests verdes
- Integração: agent factory usa `resolveTools(agentId)` no `streamText`

## References
- [AI SDK tool docs](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
