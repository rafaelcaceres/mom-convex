# [F-06] UI: tools allowlist editor in `/agents/[id]/edit`

Retroactive doc for work shipped 2026-04-30. Add a section to the agent edit page so admins can manage `agents.toolsAllowlist` (the gate F-05 introduced for remote MCP sources) without writing a mutation by hand.

## Why

F-05 wired Laminar MCP behind an allowlist entry on `agents.toolsAllowlist`. M2-T17 covers prompt / model / skills / memory in `/agents/[id]/edit` but not the allowlist field — so until this task, enabling the MCP required a one-off `convex run` against a mutation. Closes that gap; same precedent and look-and-feel as the existing sections.

## Depends on

- [M2-T17] `/agents/[id]/edit` — host page, `getById` query, admin gate, inline-styles convention.
- [F-05] introduced `toolsAllowlist` as a runtime gate (the field already existed on `NewAgentModel`; F-05 made it load-bearing).

## Decisions

- **Free-form chip list, not a typed picklist.** Today only `laminar` is recognized at runtime, but typing the field as `v.union(v.literal("laminar"), …)` would force a code change for every new MCP source. Free-form keeps the UI cheap and the source-of-truth in code (the runtime `if` in `handleIncoming`). Trade-off: an admin can type `lamniar` and silently get nothing — acceptable while this is a power-user knob with one valid value.
- **Auto-save on add/remove.** No explicit "Save" button — matches `SkillsToggle` (toggle-on-click) and `ModelSelector` (save-on-change). Reduces ceremony; the chip list is short enough that mistakes are easy to undo.
- **Reuse `updateAgent` mutation.** Added optional `toolsAllowlist: v.optional(v.array(v.string()))` to the existing admin-only patch mutation rather than creating a dedicated `setToolsAllowlist`. One auth check, one repository roundtrip. Aggregate gained `setToolsAllowlist(next: string[])` with trim + dedupe so the data stays clean even if the UI sends rough input.
- **Inline styles, no shadcn.** Same trade-off recorded in the M2-T17 decision log — the whole edit page uses inline styles; bringing a design system in for one new section would be churn.
- **Read-only for non-admins.** Disabled `Add` button + remove buttons, matches the existing `disabled={!isAdmin}` plumbing on every other section.

## Implementation

### `convex/agents/domain/agent.model.ts`

`AgentAgg.setToolsAllowlist(next: string[])` — trims each entry, drops empty strings, dedupes preserving first-seen order, assigns to `this.agent.toolsAllowlist`.

### `convex/agents/mutations/updateAgent.ts`

New optional arg `toolsAllowlist: v.optional(v.array(v.string()))`. Applied via the new aggregate setter under the same `requireOrgRole(..., "admin")` guard as the rest of the mutation.

### `app/agents/[id]/edit/ToolsAllowlistEditor.tsx` (new)

Client component. Props: `{ agentId, initial: string[], disabled }`. Renders a chip list (current entries with a `×` remove button each) plus an inline `<form>` with a text input + `Add` button. Auto-saves through `updateAgent` on every add/remove; tracks `busy`, `error`, `savedAt` locally for inline feedback. `data-testid` attrs (`tools-allowlist`, `tools-allowlist-input`, `tools-allowlist-add`, `tools-allowlist-remove-<entry>`) so an eventual playwright pass can target it without DOM walking.

### `app/agents/[id]/edit/AgentEditor.tsx`

New `<Section title="External tools">` between Skills and Memory, wired to `agent.toolsAllowlist` (which `getById` already returns via `AgentModel`).

## Acceptance tests (retro)

- `pnpm test convex/agents` — 71/71 pass; `updateAgent` test suite (7) covers the auth + persistence paths and the new field rides on the same handler. No dedicated UI tests added (repo has no playwright config; same trade-off as M2-T17).
- `pnpm typecheck` clean.

Manual smoke:

- `/agents/<id>/edit` as admin → "External tools" section visible.
- Type `laminar`, click Add → chip appears, "Saved." flash, refresh page → still there.
- Click `×` on the chip → chip removed, "Saved." flash.
- Same screen as a `member` role → banner read-only, Add button disabled, chip remove buttons disabled.
- Submit empty / duplicate → silently no-op (UI-side guard, no mutation fired).

## Non-goals

- Typed picklist of known sources — premature with one source. Revisit when a second MCP lands.
- Validation against a runtime registry of "known" sources — same reason.
- Per-source config (e.g. URL override) — the URL is hardcoded in `mcpTools.ts`.
- Audit log entry for allowlist changes — falls into M4-T08 audit-log scope.

## Done when

- ✅ `setToolsAllowlist` on the aggregate.
- ✅ `updateAgent` accepts `toolsAllowlist`.
- ✅ Editor renders, persists, and is gated by admin role.
- ✅ `pnpm typecheck` + `pnpm test convex/agents` clean.

## References

- F-05 — runtime side that consumes the allowlist.
- M2-T17 decision log entry (`TASKS.md:129`) — precedent for inline styles, read-only gate, e2e deferral.
