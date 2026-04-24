import { createRepository } from "../../_shared/_libs/repository";
import { AgentSkillAgg } from "../domain/agentSkill.model";
import type { IAgentSkillRepository } from "../domain/agentSkill.repository";

const MAX_BINDINGS_PER_AGENT = 200;

export const AgentSkillRepository: IAgentSkillRepository = {
	...createRepository("agentSkills", (doc) => new AgentSkillAgg(doc)),

	getByAgentKey: async (ctx, { agentId, skillKey }) => {
		const doc = await ctx.db
			.query("agentSkills")
			.withIndex("by_agent_skillKey", (q) => q.eq("agentId", agentId).eq("skillKey", skillKey))
			.unique();
		if (!doc) return null;
		return new AgentSkillAgg(doc);
	},

	listForAgent: async (ctx, { agentId }) => {
		const docs = await ctx.db
			.query("agentSkills")
			.withIndex("by_agent_enabled", (q) => q.eq("agentId", agentId).eq("enabled", true))
			.take(MAX_BINDINGS_PER_AGENT);
		return docs.map((doc) => new AgentSkillAgg(doc));
	},

	listAllForAgent: async (ctx, { agentId }) => {
		const docs = await ctx.db
			.query("agentSkills")
			.withIndex("by_agent", (q) => q.eq("agentId", agentId))
			.take(MAX_BINDINGS_PER_AGENT);
		return docs.map((doc) => new AgentSkillAgg(doc));
	},

	enable: async (ctx, { orgId, agentId, skillKey, config }) => {
		const existing = await ctx.db
			.query("agentSkills")
			.withIndex("by_agent_skillKey", (q) => q.eq("agentId", agentId).eq("skillKey", skillKey))
			.unique();

		if (existing) {
			const patch: { enabled: true; config?: unknown } = { enabled: true };
			if (config !== undefined) patch.config = config;
			await ctx.db.patch(existing._id, patch);
			const reloaded = await ctx.db.get(existing._id);
			if (!reloaded) throw new Error("Failed to reload agentSkills after enable");
			return new AgentSkillAgg(reloaded);
		}

		const id = await ctx.db.insert("agentSkills", {
			orgId,
			agentId,
			skillKey,
			enabled: true,
			config,
		});
		const doc = await ctx.db.get(id);
		if (!doc) throw new Error("Failed to create agentSkills");
		return new AgentSkillAgg(doc);
	},

	disable: async (ctx, { agentId, skillKey }) => {
		const existing = await ctx.db
			.query("agentSkills")
			.withIndex("by_agent_skillKey", (q) => q.eq("agentId", agentId).eq("skillKey", skillKey))
			.unique();
		if (!existing) return;
		await ctx.db.patch(existing._id, { enabled: false });
	},
};
