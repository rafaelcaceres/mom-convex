import { v } from "convex/values";
import { internalMutation } from "../../customFunctions";
import { ThreadRepository } from "../../threads/adapters/thread.repository";
import type { AdapterBinding } from "../../threads/domain/thread.model";
import { scheduleEvent } from "../_libs/schedule";
import { EventRepository } from "../adapters/event.repository";
import {
	type EventSchedule,
	type EventTarget,
	assertEventText,
	assertSchedulable,
	nextRunFor,
} from "../domain/event.model";

/**
 * Create an event on the agent's own behalf — the back end of the
 * `event.create` skill (F-10). Not user-facing: it runs from the skill
 * dispatcher mid-turn, where there is no caller identity to check.
 *
 * Separate from `createEvent` for the same reason `saveFromAgentInternal` is
 * separate from `upsertMemory`: the public mutation is built around
 * `requireOrgRole` plus caller-supplied targets guarded by tenant checks.
 * Here the boundary is structural instead — **the target is derived from the
 * thread the agent is speaking in**, never accepted from the caller. The model
 * cannot schedule a message into another channel or another user's chat,
 * because it is never asked where it is.
 *
 * The reminder therefore always lands back in the conversation where it was
 * requested — which is also the only behavior a user who says "me lembra em
 * 1h" would recognize as correct.
 */

/** The event's destination, derived from where the turn is happening. */
export function targetFromBinding(binding: AdapterBinding): EventTarget {
	switch (binding.type) {
		case "slack":
			// parentTs deliberately dropped: it anchors the CURRENT turn's tool-call
			// replies. A future fire is a fresh turn and must mint its own anchor.
			return {
				type: "slack",
				installId: binding.installId,
				channelId: binding.channelId,
				threadTs: binding.threadTs,
			};
		case "web":
			return { type: "web", userId: binding.userId };
		case "event":
			// No current code path creates event-bound threads (fireInternal
			// resolves the TARGET binding), so this is a wiring bug, not a user
			// situation — say so instead of guessing a destination.
			throw new Error("cannot schedule from an event-bound thread");
	}
}

const createFromAgentInternal = internalMutation({
	args: {
		orgId: v.string(),
		agentId: v.id("agents"),
		threadId: v.id("threads"),
		text: v.string(),
		/** Epoch ms for a one-shot. Exactly one of `at` / `cron`. */
		at: v.optional(v.number()),
		/** 5-or-6-field cron for a periodic. */
		cron: v.optional(v.string()),
		/**
		 * IANA zone for `cron`. Absent ⇒ UTC. Meaningless for `at`, which is
		 * already an absolute instant — accepted-and-ignored there rather than
		 * rejected, because a model that sends both is confused, not malicious.
		 */
		timezone: v.optional(v.string()),
	},
	returns: v.object({
		eventId: v.id("events"),
		scheduleType: v.union(v.literal("one-shot"), v.literal("periodic")),
		nextRunAt: v.optional(v.number()),
	}),
	handler: async (ctx, args) => {
		if ((args.at === undefined) === (args.cron === undefined)) {
			throw new Error("provide exactly one of `at` or `cron`");
		}

		const thread = await ThreadRepository.get(ctx, args.threadId);
		if (!thread) throw new Error("Thread not found");
		const t = thread.getModel();
		// Defence in depth: the dispatcher already runs inside this thread's turn,
		// but a mismatch here would file an event under the wrong tenant.
		if (t.orgId !== args.orgId) throw new Error("Thread does not belong to org");
		if (t.agentId !== args.agentId) throw new Error("Thread does not belong to agent");

		const now = Date.now();
		const text = assertEventText(args.text);
		const schedule: EventSchedule =
			args.at !== undefined
				? { type: "one-shot", at: args.at }
				: // biome-ignore lint/style/noNonNullAssertion: exactly-one guard above
					{ type: "periodic", cron: args.cron!, timezone: args.timezone };
		assertSchedulable(schedule, now);

		const agg = await EventRepository.create(ctx, {
			orgId: args.orgId,
			agentId: args.agentId,
			target: targetFromBinding(t.binding),
			text,
			schedule,
			status: "scheduled",
			createdAt: now,
			nextRunAt: nextRunFor(schedule, now),
		});
		await scheduleEvent(ctx, agg);

		const model = agg.getModel();
		return {
			eventId: model._id,
			scheduleType: schedule.type,
			nextRunAt: model.nextRunAt,
		};
	},
});

export default createFromAgentInternal;
