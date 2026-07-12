import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { internalMutation } from "../../customFunctions";
import { ThreadRepository } from "../../threads/adapters/thread.repository";
import { channelKeyFromBinding } from "../../threads/domain/thread.model";
import { MemoryRepository } from "../adapters/memory.repository";
import { MAX_MEMORY_CONTENT_CHARS } from "../domain/memory.model";

/**
 * Write a memory on the agent's own behalf — the back end of the `memory.save`
 * skill. Not user-facing: it runs from an action, where there is no caller
 * identity to check.
 *
 * That absence is exactly why this is a separate mutation instead of a flag on
 * `upsertMemory`. `upsertMemory` is built around `requireOrgRole` and a human
 * `updatedBy`; bolting an "actually, skip auth this time" branch onto it would
 * put the tenant boundary one bad conditional away from collapsing. Here the
 * boundary is structural instead: the scope is *derived from the thread*, never
 * accepted from the caller. The model cannot ask to write into another channel,
 * because it is never asked which channel it is in.
 *
 * Scope resolution:
 *  - Platform has a channel (Slack) → `channel` scope, keyed by that channel.
 *  - No channel (web chat, scheduled event) → `thread` scope. Requesting
 *    `channel` there is a client bug, so it degrades to thread rather than
 *    inventing a room.
 *
 * `alwaysOn` defaults to true: an agent-written memory that isn't in the system
 * prompt and isn't yet semantically searchable (M3-T04) would be a fact the bot
 * saved and can never recall — a silent no-op, which is worse than not offering
 * the skill at all.
 */
const saveFromAgentInternal = internalMutation({
	args: {
		orgId: v.string(),
		agentId: v.id("agents"),
		threadId: v.id("threads"),
		content: v.string(),
		scope: v.optional(v.union(v.literal("channel"), v.literal("thread"))),
		alwaysOn: v.optional(v.boolean()),
	},
	returns: v.object({
		memoryId: v.id("memory"),
		scope: v.union(v.literal("channel"), v.literal("thread")),
		channelKey: v.optional(v.string()),
	}),
	handler: async (ctx, args) => {
		const content = args.content.trim();
		if (content.length === 0) throw new Error("content cannot be empty");
		if (content.length > MAX_MEMORY_CONTENT_CHARS) {
			throw new Error(`content exceeds ${MAX_MEMORY_CONTENT_CHARS} chars`);
		}

		const thread = await ThreadRepository.get(ctx, args.threadId);
		if (!thread) throw new Error("Thread not found");
		const t = thread.getModel();
		// Defence in depth: the action already runs inside this thread's turn, but
		// a mismatch here would mean a memory filed under the wrong tenant.
		if (t.orgId !== args.orgId) throw new Error("Thread does not belong to org");
		if (t.agentId !== args.agentId) throw new Error("Thread does not belong to agent");

		const channelKey = channelKeyFromBinding(t.binding);
		const wantsChannel = (args.scope ?? "channel") === "channel";
		const useChannel = wantsChannel && channelKey !== undefined;

		const now = Date.now();
		const agg = await MemoryRepository.create(
			ctx,
			useChannel
				? {
						orgId: args.orgId,
						scope: "channel",
						channelKey,
						content,
						alwaysOn: args.alwaysOn ?? true,
						updatedByAgentId: args.agentId,
						updatedAt: now,
					}
				: {
						orgId: args.orgId,
						scope: "thread",
						agentId: args.agentId,
						threadId: args.threadId,
						content,
						alwaysOn: args.alwaysOn ?? true,
						updatedByAgentId: args.agentId,
						updatedAt: now,
					},
		);

		return {
			memoryId: agg.getModel()._id as Id<"memory">,
			scope: useChannel ? ("channel" as const) : ("thread" as const),
			channelKey: useChannel ? channelKey : undefined,
		};
	},
});

export default saveFromAgentInternal;
