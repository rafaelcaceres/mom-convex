import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { IRepository } from "../../_shared/_libs/repository";
import type { AgentSkill, AgentSkillAgg } from "./agentSkill.model";

export interface IAgentSkillRepository extends IRepository<"agentSkills", AgentSkillAgg> {
	getByAgentKey(
		ctx: QueryCtx,
		clause: { agentId: AgentSkill["agentId"]; skillKey: AgentSkill["skillKey"] },
	): Promise<AgentSkillAgg | null>;

	/**
	 * Returns only enabled bindings for the given agent. Disabled bindings
	 * stay in the table (preserving config through toggle cycles) but are
	 * excluded from tool resolution.
	 */
	listForAgent(ctx: QueryCtx, clause: { agentId: AgentSkill["agentId"] }): Promise<AgentSkillAgg[]>;

	/**
	 * Idempotent enable: inserts a fresh binding, or flips a soft-disabled
	 * row back to `enabled: true`. Preserves existing `config` unless the
	 * caller passes a new one.
	 */
	enable(
		ctx: MutationCtx,
		clause: {
			orgId: AgentSkill["orgId"];
			agentId: AgentSkill["agentId"];
			skillKey: AgentSkill["skillKey"];
			config?: unknown;
		},
	): Promise<AgentSkillAgg>;

	/** Soft-delete: sets `enabled: false`. No-op if no binding exists. */
	disable(
		ctx: MutationCtx,
		clause: { agentId: AgentSkill["agentId"]; skillKey: AgentSkill["skillKey"] },
	): Promise<void>;
}
