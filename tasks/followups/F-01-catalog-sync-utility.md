# [F-01] Catalog sync utility — upsert-on-diff for `skillCatalog`

Follow-up surfaced by **M2-T08** manual smoke. Not blocking any milestone; bundle into the first milestone that adds ≥2 new built-in skills with churn.

## Why

`seedSkillCatalog` (M2-T02) is strictly **insert-if-missing / idempotent**. When we change the zod schema of an existing built-in (as in M2-T08's `memory.search`), the stored `zodSchemaJson` stays stale and `resolveTools` advertises an outdated schema to the model — tool calls then fail Zod validation inside `skills.invoke` with `invalid_value` errors.

Workaround today: manually delete the row in dashboard → re-run seed. Works but is a footgun (easy to forget) and only visible after the agent breaks live.

## Why this was deferred

Decision taken during M2-T08 (see `TASKS.md` decision log). Summary:
- Scope creep vs. M2-T08 (stub skill, not catalog lifecycle).
- Diff-by-`zodSchemaJson` string is brittle (depends on zod serialization determinism).
- Auto-upgrade can mask silent migrations (e.g. `sideEffect: "read" → "write"` flipping tool behavior without an audit trail).
- Pain is pointable (clear error in logs) and infrequent.

## Proposed scope

1. **New internal mutation** `skills/mutations/resyncSkillCatalog`:
   - Iterates `BUILT_IN_SKILLS`.
   - Compares parsed `zodSchemaJson` (deep-equal, not raw string) and fields (`name`, `description`, `sideEffect`, `enabled`).
   - On diff, `ctx.db.patch` with the new fields; logs `{skillKey, changedFields}` per update.
   - Returns summary `{updated: string[], unchanged: string[], inserted: string[]}`.
2. **Keep `seedCatalog` idempotent** — do not change its behavior. Predictable insert-if-missing stays the default for fresh deployments and tests.
3. **Add a dashboard doc note** (or expand `convex/skills/README.md` if we create one) describing the deploy flow:
   - `seedCatalog` after first deploy.
   - `resyncSkillCatalog` after any change to `BUILT_IN_SKILLS`.

## Non-goals

- Auto-run on deploy. Keep it an operator-initiated command until we have versioning on skill schemas (track with `catalogVersion` bump if we want zero-touch later).
- Touching `agentSkills.config` — config is free-form `v.any()` and intentionally disconnected from catalog `zodSchemaJson` (call-time validation happens in the impl).

## Acceptance tests

- `resyncSkillCatalog` updates a row whose `zodSchemaJson` parsed differs.
- `resyncSkillCatalog` does NOT touch a row whose parsed JSON matches (even if whitespace differs).
- Summary object lists keys correctly.
- `seedCatalog` still idempotent (regression check).

## Done when

- Operator runs `npx convex run skills/mutations/resyncSkillCatalog` after editing a `BUILT_IN_SKILLS` entry and sees the row updated without manual delete.
- Tests green.
- README / docstring updated.
