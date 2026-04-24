/**
 * Default registrations for skills whose real implementations land in later
 * tasks. Each stub throws with a message that names the target task so the
 * model (and developers) immediately see why a call failed.
 *
 * When a task implements a skill for real, replace its entry here with a
 * new file under `convex/skills/impls/<skillName>.ts` that calls
 * `registerSkill(...)` at import time, and add the import to `invoke.ts`.
 * Last registration wins, so the new file overrides whatever is here.
 *
 * No stubs remain at this point — `http.fetch` (M2-T06), `memory.search`
 * (M2-T08), and all four `sandbox.*` impls (M2-T12) have real files.
 * Keeping this module as an explicit import anchor so new skills added
 * between tasks have an obvious place to drop a temporary throw-stub.
 */
export {};
