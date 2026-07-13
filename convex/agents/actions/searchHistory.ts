import { v } from "convex/values";
import { internalAction } from "../../customFunctions";
import { searchThreadMessages } from "../adapters/threadBridge";

/**
 * Search this thread's own message history (M3-T04). Backs `scope: "history"`
 * of the `memory.search` skill.
 *
 * An action because the component's search runs one, and an *internal* one
 * because the caller is the skill dispatcher mid-turn: the thread context has
 * already been established upstream, so there is no user identity to check here.
 * The `agentThreadId` comes from the turn's scope, never from the model — which
 * is why the model cannot read another conversation by naming it.
 *
 * Messages returned can exceed `limit`: it caps *hits*, and each hit carries the
 * message either side of it for context (see `searchThreadMessages`).
 */
const searchHistory = internalAction({
	args: {
		agentThreadId: v.string(),
		query: v.string(),
		limit: v.optional(v.number()),
	},
	returns: v.array(
		v.object({
			messageId: v.string(),
			role: v.string(),
			text: v.string(),
			order: v.number(),
		}),
	),
	handler: async (ctx, args) => {
		const query = args.query.trim();
		if (query.length === 0) throw new Error("query cannot be empty");

		const docs = await searchThreadMessages(ctx, {
			agentThreadId: args.agentThreadId,
			searchText: query,
			limit: args.limit ?? 10,
		});

		return docs
			.filter((doc) => doc.text !== undefined && doc.text.length > 0)
			.map((doc) => ({
				messageId: doc._id,
				role: doc.message?.role ?? "assistant",
				text: doc.text ?? "",
				order: doc.order,
			}));
	},
});

export default searchHistory;
