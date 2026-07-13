import { v } from "convex/values";
import { internalQuery } from "../../customFunctions";
import { EventRepository } from "../adapters/event.repository";
import { EventScheduleModel, EventStatusModel } from "../domain/event.model";

/**
 * The agent's own events, for the `event.list` skill (F-10). Backs the
 * conversation loop "what do I have scheduled?" → "cancela o segundo" — and is
 * where `event.cancel` gets legitimate eventIds from.
 *
 * Trimmed to what the model needs to talk about an event (no target binding —
 * the model doesn't need channel internals to say "the deploy check"). The org
 * check mirrors the write paths' defence in depth; newest first, capped,
 * because an agent narrating 500 dead one-shots helps no one.
 */
const MAX_LISTED = 50;

const listForAgentInternal = internalQuery({
	args: {
		orgId: v.string(),
		agentId: v.id("agents"),
	},
	returns: v.array(
		v.object({
			eventId: v.id("events"),
			text: v.string(),
			schedule: EventScheduleModel,
			status: EventStatusModel,
			nextRunAt: v.optional(v.number()),
			lastFiredAt: v.optional(v.number()),
		}),
	),
	handler: async (ctx, args) => {
		const aggs = await EventRepository.listByAgent(ctx, args.agentId);
		return aggs
			.map((a) => a.getModel())
			.filter((e) => e.orgId === args.orgId)
			.slice(0, MAX_LISTED)
			.map((e) => ({
				eventId: e._id,
				text: e.text,
				schedule: e.schedule,
				status: e.status,
				nextRunAt: e.nextRunAt,
				lastFiredAt: e.lastFiredAt,
			}));
	},
});

export default listForAgentInternal;
