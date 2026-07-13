import type { Change } from "convex-helpers/server/triggers";
import type { DataModel, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { AgentSkillRepository } from "./adapters/agentSkill.repository";
import { SkillCatalogRepository } from "./adapters/skillCatalog.repository";

/**
 * Baseline skills handed to every newly-inserted agent. Keep this list short:
 * any skill added here auto-enables on fresh agents across all orgs, which
 * widens attack surface and token spend.
 *
 * `http.fetch` + `memory.search` + `event.list` are read-only and low-risk.
 * `memory.save` is a write that earns the slot: remembering is the whole point
 * of the product, and an agent that can only *read* memory can never populate
 * it. Its blast radius is a reversible row scoped to the room the conversation
 * is already in — see the catalog entry, which opts it out of confirmation
 * deliberately rather than by mislabelling its side effect.
 *
 * `event.create` + `event.cancel` (F-10) follow the same argument: scheduling
 * itself is pi-mom parity ("me lembra em 1h" said TO the bot), the row is
 * reversible and structurally confined to the current conversation's
 * tenant/target, and cancel ships in the same set precisely so the
 * conversational brake exists before the events UI (M4-T04) does. What keeps
 * this honest: each fire spends a real agent turn, so cost is the blast
 * radius — watch the ledger until the rate limiter (M4-T06) lands.
 *
 * Existing agents predate this list; `backfillBaselineSkills` grants it to them.
 */
export const BASELINE_SKILL_KEYS = [
	"http.fetch",
	"memory.search",
	"memory.save",
	"event.create",
	"event.list",
	"event.cancel",
] as const;

/**
 * Idempotent baseline seed for a single agent. Shared between the trigger
 * (new agents) and the `backfillBaselineSkills` mutation (retroactive for
 * agents created before the trigger existed).
 *
 * Lenient by design — if the catalog has not been seeded yet (fresh dev
 * deployment), we skip silently instead of blocking. Production is expected
 * to run `skills.seedCatalog` once before users onboard.
 */
export async function seedBaselineSkillsForAgentId(
	ctx: MutationCtx,
	clause: { orgId: string; agentId: Id<"agents"> },
): Promise<string[]> {
	const seeded: string[] = [];
	for (const key of BASELINE_SKILL_KEYS) {
		const entry = await SkillCatalogRepository.getByKey(ctx, { key });
		if (!entry || !entry.getModel().enabled) continue;
		await AgentSkillRepository.enable(ctx, {
			orgId: clause.orgId,
			agentId: clause.agentId,
			skillKey: key,
		});
		seeded.push(key);
	}
	return seeded;
}

/** Trigger handler registered in `convex/_triggers.ts` on `agents` inserts. */
export async function seedBaselineSkillsForAgent(
	ctx: MutationCtx,
	change: Change<DataModel, "agents">,
): Promise<void> {
	if (change.operation !== "insert") return;
	await seedBaselineSkillsForAgentId(ctx, {
		orgId: change.newDoc.orgId,
		agentId: change.newDoc._id,
	});
}
