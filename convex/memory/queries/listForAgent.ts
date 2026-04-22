import { v } from "convex/values";
import { AgentRepository } from "../../agents/adapters/agent.repository";
import { requireOrgRole } from "../../auth.utils";
import { query } from "../../customFunctions";
import { MemoryRepository } from "../adapters/memory.repository";
import { MemoryModel } from "../domain/memory.model";

/**
 * Org-wide + agent-scoped memories for `agentId`. Read auth requires
 * org `member` — every org member can see the org's knowledge base.
 *
 * Thread-scoped rows are excluded; `listForThread` is the query that
 * includes them (they need a specific thread for visibility).
 */
const listForAgent = query({
	args: { agentId: v.id("agents") },
	returns: v.array(MemoryModel),
	handler: async (ctx, args) => {
		const agent = await AgentRepository.get(ctx, args.agentId);
		if (!agent) return [];
		const orgId = agent.getModel().orgId;
		await requireOrgRole(ctx, orgId, "member");
		const rows = await MemoryRepository.listForAgent(ctx, { orgId, agentId: args.agentId });
		return rows.map((r) => r.getModel());
	},
});

export default listForAgent;
