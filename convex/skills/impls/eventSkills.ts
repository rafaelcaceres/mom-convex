import { z } from "zod";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { type SkillImpl, registerSkill } from "../_libs/skillImpls";

/**
 * `event.*` skills — the agent scheduling itself (F-10): "me lembra em 1h",
 * "checa o deploy a cada 5 minutos", "o que eu tenho agendado?", "esquece
 * aquele lembrete".
 *
 * The model chooses only WHAT and WHEN. WHERE is derived server-side from the
 * thread the conversation is happening in (`createFromAgentInternal`), so a
 * reminder always lands back in this conversation and the model cannot aim one
 * at another channel or another user's chat — same structural boundary as
 * `memory.save`.
 *
 * Time comes in three mutually-exclusive shapes because models fail them
 * differently:
 *  - `afterMinutes` — for relative asks ("in an hour"). Immune to clock and
 *    timezone mistakes, so the tool description steers the model here first.
 *  - `at` — ISO 8601 with a mandatory `Z`, for absolute asks. An unlabelled
 *    local time is precisely the three-hours-off bug, so zod rejects it.
 *  - `cron` — recurring, paired with `timezone`. The `## Current Time` block
 *    hands the model both clocks and the user's IANA zone, so it can pass one.
 *
 * `timezone` on a cron is the difference between "todo dia às 9h" meaning the
 * user's morning and meaning 6am in São Paulo. Absent ⇒ UTC, deliberately and
 * explicitly (never the host's zone — see `parseCron`).
 */

const EventCreateArgs = z
	.object({
		text: z.string().min(1).max(2000),
		at: z.string().datetime().optional(),
		afterMinutes: z
			.number()
			.positive()
			.max(60 * 24 * 366) // a year out; beyond that it's a typo, not a plan
			.optional(),
		cron: z.string().optional(),
		timezone: z.string().optional(),
	})
	.refine((a) => [a.at, a.afterMinutes, a.cron].filter((x) => x !== undefined).length === 1, {
		message: "provide exactly one of `at`, `afterMinutes`, or `cron`",
	});

export const eventCreateImpl: SkillImpl = async (ctx, input, options) => {
	const args = EventCreateArgs.parse(input);
	const { orgId, agentId, threadId } = options.scope;

	const at =
		args.at !== undefined
			? Date.parse(args.at)
			: args.afterMinutes !== undefined
				? Date.now() + args.afterMinutes * 60_000
				: undefined;

	const result = await ctx.runMutation(internal.events.mutations.createFromAgentInternal.default, {
		orgId,
		agentId,
		threadId,
		text: args.text,
		at,
		cron: args.cron,
		timezone: args.timezone,
	});

	return {
		created: true,
		eventId: result.eventId,
		scheduleType: result.scheduleType,
		timezone: args.cron ? (args.timezone ?? "UTC") : undefined,
		// ISO, not epoch — the model is going to read this back to a human.
		nextRunAt: result.nextRunAt ? new Date(result.nextRunAt).toISOString() : undefined,
	};
};

const EventListArgs = z.object({}).strict();

export const eventListImpl: SkillImpl = async (ctx, input, options) => {
	EventListArgs.parse(input ?? {});
	const { orgId, agentId } = options.scope;

	const events = await ctx.runQuery(internal.events.queries.listForAgentInternal.default, {
		orgId,
		agentId,
	});

	return {
		events: events.map((e) => ({
			eventId: e.eventId,
			text: e.text,
			schedule: e.schedule,
			status: e.status,
			nextRunAt: e.nextRunAt ? new Date(e.nextRunAt).toISOString() : undefined,
			lastFiredAt: e.lastFiredAt ? new Date(e.lastFiredAt).toISOString() : undefined,
		})),
	};
};

const EventCancelArgs = z.object({
	/** From `event.list` — the server re-checks ownership, so a wrong id just errors. */
	eventId: z.string().min(1),
});

export const eventCancelImpl: SkillImpl = async (ctx, input, options) => {
	const args = EventCancelArgs.parse(input);
	const { orgId, agentId } = options.scope;

	const result = await ctx.runMutation(internal.events.mutations.cancelFromAgentInternal.default, {
		orgId,
		agentId,
		eventId: args.eventId as Id<"events">,
	});

	return result;
};

registerSkill("event.create", eventCreateImpl);
registerSkill("event.list", eventListImpl);
registerSkill("event.cancel", eventCancelImpl);
