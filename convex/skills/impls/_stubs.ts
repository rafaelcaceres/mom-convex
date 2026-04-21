import { registerSkill } from "../_libs/skillImpls";

/**
 * Default registrations for skills whose real implementations land in later
 * tasks. Each stub throws with a message that names the target task so the
 * model (and developers) immediately see why a call failed.
 *
 * When a task implements a skill for real, replace its entry here with a
 * new file under `convex/skills/impls/<skillName>.ts` that calls
 * `registerSkill(...)` at import time, and add the import to `invoke.ts`.
 * Last registration wins, so the new file overrides whatever is here.
 */

registerSkill("memory.search", async () => {
	throw new Error("memory.search impl lands in M2-T08");
});

registerSkill("sandbox.bash", async () => {
	throw new Error("sandbox.bash impl lands in M2-T12");
});

registerSkill("sandbox.read", async () => {
	throw new Error("sandbox.read impl lands in M2-T12");
});

registerSkill("sandbox.write", async () => {
	throw new Error("sandbox.write impl lands in M2-T12");
});

registerSkill("sandbox.browse", async () => {
	throw new Error("sandbox.browse impl lands in M2-T12");
});
