import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { AgentRepository } from "../../agents/adapters/agent.repository";
import { requireOrgRole } from "../../auth.utils";
import { mutation } from "../../customFunctions";
import { SlackInstallRepository } from "../../slack/adapters/slackInstall.repository";
import { scheduleEvent } from "../_libs/schedule";
import { EventRepository } from "../adapters/event.repository";
import {
	EventScheduleModel,
	EventTargetModel,
	assertEventText,
	assertSchedulable,
	nextRunFor,
} from "../domain/event.model";

/**
 * Create an event and hand it to the scheduling engine (M4-T03), in one
 * transaction — if registration fails, no orphan row; if the insert fails,
 * nothing was scheduled.
 *
 * `member` is enough: firing an event does exactly what that member could do by
 * typing the same text into the chat, on a timer. It shapes no org-wide
 * behavior the way `org`-scoped memory does.
 *
 * The target checks are tenant boundaries, not bookkeeping:
 *  - a **web** target must be the caller's own — events post as unprompted
 *    messages into that user's thread, and "member A schedules messages into
 *    member B's chat" is spam at best;
 *  - a **slack** target's install must belong to this org — `installId` is a
 *    plain string in the binding, and without this check a caller could point
 *    an event at another tenant's workspace and have `fireInternal` post there
 *    with *that org's* bot token.
 */
const createEvent = mutation({
	args: {
		orgId: v.string(),
		agentId: v.id("agents"),
		target: EventTargetModel,
		text: v.string(),
		schedule: EventScheduleModel,
	},
	returns: v.id("events"),
	handler: async (ctx, args): Promise<Id<"events">> => {
		const now = Date.now();
		const text = assertEventText(args.text);
		assertSchedulable(args.schedule, now);

		await requireOrgRole(ctx, args.orgId, "member");

		const agent = await AgentRepository.get(ctx, args.agentId);
		if (!agent || agent.getModel().orgId !== args.orgId) {
			throw new Error("Agent not found in org");
		}

		if (args.target.type === "web") {
			const userId = await getAuthUserId(ctx);
			if (args.target.userId !== userId) {
				throw new Error("web-targeted events must target the caller's own thread");
			}
		} else {
			const install = await SlackInstallRepository.getByIdString(ctx, args.target.installId);
			if (!install || install.getModel().orgId !== args.orgId) {
				throw new Error("Slack install not found in org");
			}
		}

		const agg = await EventRepository.create(ctx, {
			orgId: args.orgId,
			agentId: args.agentId,
			target: args.target,
			text,
			schedule: args.schedule,
			status: "scheduled",
			createdAt: now,
			nextRunAt: nextRunFor(args.schedule, now),
		});
		await scheduleEvent(ctx, agg);

		return agg.getModel()._id;
	},
});

export default createEvent;
