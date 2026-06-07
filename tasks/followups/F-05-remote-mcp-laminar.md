# [F-05] Remote MCP integration — Laminar (allowlist-gated)

Retroactive doc for work shipped 2026-04-30. Plug a remote HTTP MCP server (Laminar — `https://flow.taller.work/api/mcp`) into the agent runtime so per-agent tool sets can include external tools without going through the skill catalog. First MCP wired; the integration is generic and can host more remotes later.

## Why

Skill catalog is the right home for tools we own end-to-end (auditing, declared `sideEffect`, confirmation gate). Remote MCPs publish tool lists dynamically and change shape outside our control — modeling each remote tool as a catalog row would force a seed/migration loop for every upstream change. Instead: allowlist a *source*, fetch its tool list at turn-time, hand the merged toolset to the AI SDK. Cost ledger still records per-tool usage via `onStepFinish` (provider-agnostic).

## Depends on

- [M2-T04] `buildToolSet` / `resolveTools` bridge — MCP tools merge into the same `ToolSet`.
- [M2-T15] `onStepFinish` cost ledger — fires for any tool, MCP included.
- AI SDK v6 `@ai-sdk/mcp@1.x` exposing `experimental_createMCPClient` with HTTP transport.

## Decisions

- **Allowlist-gated, per-agent.** Agents must have `"laminar"` in `agents.toolsAllowlist` to receive the MCP tools. Default off — Slack-bot and webchat decide individually. Considered always-on (rejected: surprise blast radius) and catalog-as-skills (rejected: re-introduces the seed/migration churn we wanted to avoid).
- **Trust model: `read` (no gate).** Skill catalog skills with `sideEffect: "write"` go through the M3-T11 confirmation flow; MCP tools have no equivalent metadata, so today everything passes through as if read-only. If a destructive tool surfaces upstream we revisit (deny-list by name was the mid-option).
- **Out of catalog.** MCP tools don't appear in `/agents/[id]/edit` Skills list, don't generate `skills.invoke` audit lines, and don't get the dangerous-arg heuristic. They DO generate `cost.record` `tool-call` rows because `onStepFinish` doesn't distinguish source.
- **Tool name prefix `laminar_`.** Avoids collision with skill catalog entries (which already pass through `toolNameFromSkillKey`).
- **Token via Convex env var.** `LAMINAR_MCP_TOKEN` — not in `.env`. Missing token degrades to "MCP disabled" with a `console.warn`, never throws mid-turn.
- **Best-effort cleanup in `finally`.** HTTP transport keeps a session against the remote; we always `await mcp.close()` after the turn (errors swallowed inside the loader so they can never mask `streamErr`).
- **V8 runtime, not Node.** AI SDK MCP HTTP transport uses `globalThis.fetch` only — runs in the existing `handleIncoming` action without `"use node"`.

## Implementation

### `convex/agents/_libs/mcpTools.ts` (new)

`loadLaminarMcpTools()` returns `{ tools: ToolSet, close: () => Promise<void> }`. URL hardcoded to `https://flow.taller.work/api/mcp`; reads `LAMINAR_MCP_TOKEN` from env and sends `Authorization: Bearer <token>`. Handshake or `tools/list` failures log and return the empty handle. Tool keys are namespaced with `laminar_<name>`. Type bridge: `client.tools()` returns `McpToolSet<'automatic'>` whose `inputSchema` is `FlexibleSchema<never>` and structurally rejects `ToolSet`; we widen via `Record<string, unknown>` and cast on the way out.

### `convex/agentRunner/actions/handleIncoming.ts`

After `buildToolSet` returns `skillTools`, gate on `agentDoc.toolsAllowlist.includes("laminar")` and call `loadLaminarMcpTools()`; merge `{ ...skillTools, ...mcp.tools }` and pass to `streamAssistantReply`. Wrap the existing `try`/`catch` around `streamAssistantReply` with a `finally` that `await`s `mcp.close()` (no-op when MCP wasn't loaded).

### `package.json`

`pnpm add @ai-sdk/mcp` (v1.0.37). No peer-dep churn.

## Acceptance tests (retro)

Existing `convex/agentRunner/actions/handleIncoming.test.ts` (6 tests) re-ran clean — MCP path is opt-in via allowlist, so default fixtures don't exercise it. No new tests added because:
- Loader makes a real HTTP call; would need MSW or a fake transport. Worth doing when we add a second MCP and `loadLaminarMcpTools` generalizes into `loadMcpToolsFor(source)`.
- Allowlist gate is a one-line `Array.includes` check — covered transitively when an integration test exercises a MCP-enabled agent.

Smoke (manual, blocked on real token):

- `npx convex env set LAMINAR_MCP_TOKEN <token>`
- Add `"laminar"` to an agent's `toolsAllowlist` (UI from F-06).
- Send a chat turn → `convex dev` log shows `[mcp.laminar]` handshake silence (success), and `cost.record` `tool-call` rows include `laminar_*` tool names if the model picked one.

## Non-goals

- Confirmation gate / dangerous-arg heuristic for MCP tools (revisit if Laminar publishes destructive tools).
- Surfacing MCP tools as "virtual skills" in `/agents/[id]/edit` (would require a query that merges catalog + MCP `tools/list` snapshots; high churn for low value while we have one MCP).
- Multi-MCP routing — `mcpTools.ts` hardcodes the Laminar URL. When a second MCP lands, generalize to `loadMcpToolsFor(source: string)` keyed off the allowlist entry.
- Retry / backoff on transient handshake failures — single attempt, fall back to empty toolset, agent runs without MCP for that turn.

## Done when

- ✅ `@ai-sdk/mcp` installed.
- ✅ `mcpTools.ts` loader compiles and degrades gracefully on missing token.
- ✅ `handleIncoming` merges MCP tools when allowlisted, closes the client in `finally`.
- ✅ `pnpm typecheck` clean.
- ✅ `pnpm test convex/agentRunner` 6/6.

## References

- AI SDK v6 MCP changelog: `node_modules/ai/CHANGELOG.md:1252-1265` (move to `@ai-sdk/mcp` package).
- `MCPTransportConfig` shape: `node_modules/@ai-sdk/mcp/dist/index.d.ts` (`type: 'sse' | 'http'`, `headers: Record<string,string>`).
- F-06 — UI for the allowlist field.
