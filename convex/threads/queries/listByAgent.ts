import { v } from "convex/values";
import { requireIdentity } from "../../auth.utils";
import { query } from "../../customFunctions";
import { ThreadRepository } from "../adapters/thread.repository";
import { ThreadModel } from "../domain/thread.model";

const listByAgent = query({
	args: { agentId: v.id("agents") },
	returns: v.array(ThreadModel),
	handler: async (ctx, args) => {
		await requireIdentity(ctx);
		const aggs = await ThreadRepository.listByAgent(ctx, { agentId: args.agentId });
		return aggs.map((a) => a.getModel());
	},
});

export default listByAgent;
