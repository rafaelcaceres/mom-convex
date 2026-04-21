import { type Infer, v } from "convex/values";
import type { IAggregate } from "../../_shared/_libs/aggregate";

/**
 * Binding between an `agents` row and a `skillCatalog` key. Lives in its own
 * table (not an array column on `agents`) so per-binding config and toggling
 * doesn't rewrite the parent doc.
 *
 * `orgId` is denormalized from the parent agent so tenant-scoped queries and
 * authz checks avoid a JOIN. Kept in sync at write time — bindings are only
 * created for the agent's org, and agents don't move across orgs.
 *
 * `disable` soft-deletes (sets `enabled: false`) rather than dropping the row,
 * so per-binding `config` survives a toggle-off → toggle-on cycle.
 *
 * `config` is a free-form bag today — each skill declares its own shape at the
 * catalog level (`zodSchemaJson`), and `skills.invoke` (M2-T05) validates at
 * call time. Using `v.any()` keeps the persistence layer flexible until those
 * per-skill shapes stabilize.
 */
export const NewAgentSkillModel = v.object({
	orgId: v.string(),
	agentId: v.id("agents"),
	skillKey: v.string(),
	enabled: v.boolean(),
	config: v.optional(v.any()),
});

export const AgentSkillModel = v.object({
	_id: v.id("agentSkills"),
	_creationTime: v.number(),
	...NewAgentSkillModel.fields,
});

export type NewAgentSkill = Infer<typeof NewAgentSkillModel>;
export type AgentSkill = Infer<typeof AgentSkillModel>;

export class AgentSkillAgg implements IAggregate<AgentSkill> {
	constructor(private readonly binding: AgentSkill) {}

	getModel(): AgentSkill {
		return this.binding;
	}

	enable(): void {
		this.binding.enabled = true;
	}

	disable(): void {
		this.binding.enabled = false;
	}

	setConfig(config: unknown): void {
		this.binding.config = config;
	}
}
