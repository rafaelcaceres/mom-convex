import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { createAgentThread } from "../../agents/adapters/threadBridge";
import { ThreadRepository } from "../adapters/thread.repository";
import { type AdapterBinding, bindingKey } from "../domain/thread.model";

/**
 * Idempotent thread resolver: existing thread for `{orgId, binding}` or a fresh
 * row backed by a `@convex-dev/agent` thread.
 *
 * Extracted from the `ensureThread` internalMutation so callers that are
 * *already* mutations can share it — a mutation cannot `ctx.runMutation`
 * another mutation, and the first such caller is `events.fireInternal`
 * (M4-T02), which resolves an event's target inside its own transaction. The
 * internalMutation stays as the cross-context entry point for actions (slack
 * inbound); both are this one function, so "which thread does this binding
 * mean?" cannot drift between the two paths.
 */
export async function ensureThread(
	ctx: MutationCtx,
	args: { orgId: string; agentId: Id<"agents">; binding: AdapterBinding },
): Promise<Id<"threads">> {
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
}
