import { z } from "zod";
import { internal } from "../../_generated/api";
import { type SkillImpl, registerSkill } from "../_libs/skillImpls";

/**
 * `memory.save` skill — "remember this".
 *
 * The model supplies only the *content* (and, optionally, how broadly to file
 * it). Where the memory lands is resolved server-side from the thread's
 * binding: a Slack turn files under the channel, so every future thread in that
 * channel recalls it; a web turn files under the conversation. The model is
 * never told which channel it is in, and so cannot write into another one —
 * the tenant boundary is a property of the data, not of the model's good
 * behaviour.
 *
 * Written memories are `alwaysOn` by default, which means they reach the next
 * turn through the system prompt (M2-T09) rather than through semantic search
 * (M3-T04, not yet live). That is what makes this skill useful *today*. The
 * embedding trigger (M3-T02) still vectorizes the row on write, so these
 * memories become searchable the moment M3-T04 lands, with no backfill.
 */

const MemorySaveArgs = z.object({
	content: z.string().min(1).max(8000),
	scope: z.enum(["channel", "thread"]).optional(),
	alwaysOn: z.boolean().optional(),
});

export type MemorySaveResult = {
	saved: true;
	memoryId: string;
	scope: "channel" | "thread";
	/** Present only for channel-scoped saves; lets the model say *where* it filed the fact. */
	channelKey?: string;
};

export const memorySaveImpl: SkillImpl = async (ctx, input, options) => {
	const args = MemorySaveArgs.parse(input);
	const { orgId, agentId, threadId } = options.scope;

	const result = await ctx.runMutation(internal.memory.mutations.saveFromAgentInternal.default, {
		orgId,
		agentId,
		threadId,
		content: args.content,
		scope: args.scope,
		alwaysOn: args.alwaysOn,
	});

	return {
		saved: true,
		memoryId: result.memoryId,
		scope: result.scope,
		channelKey: result.channelKey,
	} satisfies MemorySaveResult;
};

registerSkill("memory.save", memorySaveImpl);
