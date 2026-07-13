import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { internalMutation } from "../../customFunctions";
import { ensureThread } from "../_libs/ensureThread";
import { AdapterBindingModel } from "../domain/thread.model";

/**
 * Idempotent thread resolver. Given `{orgId, agentId, binding}`, return the
 * existing thread id if one already matches, otherwise create a fresh row
 * backed by a `@convex-dev/agent` thread (whose id is stored in
 * `agentThreadId` for later `saveMessage`/`listMessages` calls).
 *
 * Internal-only by design — platform adapters (slack inbound, webChat) are
 * the sole callers. They resolve org+agent from their own context and
 * forward the binding shape verbatim.
 *
 * Thin shell over `_libs/ensureThread` — the logic lives there so mutations
 * (which cannot `ctx.runMutation` one another) can call it in-transaction;
 * `events.fireInternal` (M4-T02) does exactly that.
 */
const ensureThreadMutation = internalMutation({
	args: {
		orgId: v.string(),
		agentId: v.id("agents"),
		binding: AdapterBindingModel,
	},
	returns: v.id("threads"),
	handler: async (ctx, args): Promise<Id<"threads">> => ensureThread(ctx, args),
});

export default ensureThreadMutation;
