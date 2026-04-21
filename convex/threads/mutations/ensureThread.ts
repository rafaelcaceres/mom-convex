import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { createAgentThread } from "../../agents/adapters/threadBridge";
import { internalMutation } from "../../customFunctions";
import { ThreadRepository } from "../adapters/thread.repository";
import { AdapterBindingModel, bindingKey } from "../domain/thread.model";

/**
 * Idempotent thread resolver. Given `{orgId, agentId, binding}`, return the
 * existing thread id if one already matches, otherwise create a fresh row
 * backed by a `@convex-dev/agent` thread (whose id is stored in
 * `agentThreadId` for later `saveMessage`/`listMessages` calls).
 *
 * Internal-only by design — platform adapters (slack inbound, webChat) are
 * the sole callers. They resolve org+agent from their own context and
 * forward the binding shape verbatim.
 */
const ensureThread = internalMutation({
	args: {
		orgId: v.string(),
		agentId: v.id("agents"),
		binding: AdapterBindingModel,
	},
	returns: v.id("threads"),
	handler: async (ctx, args): Promise<Id<"threads">> => {
		const key = bindingKey(args.binding);
		const existing = await ThreadRepository.getByOrgBinding(ctx, {
			orgId: args.orgId,
			bindingKey: key,
		});
		if (existing) return existing.getModel()._id;

		const userId = args.binding.type === "web" ? args.binding.userId : undefined;
		const agentThreadId = await createAgentThread(ctx, { userId });

		const agg = await ThreadRepository.create(ctx, {
			orgId: args.orgId,
			agentId: args.agentId,
			agentThreadId,
			binding: args.binding,
			bindingKey: key,
		});
		return agg.getModel()._id;
	},
});

export default ensureThread;
