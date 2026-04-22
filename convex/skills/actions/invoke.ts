import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../customFunctions";
import { hasDangerousArgPattern } from "../_libs/confirmationHeuristics";
import {
	type ToolResult,
	formatImplError,
	formatSuccess,
	formatUnknownSkill,
} from "../_libs/errorFormatting";
import { getSkillImpl } from "../_libs/skillImpls";
// Side-effect import — registers stubs for every catalog skill that doesn't
// have a dedicated impl file yet. Task-specific impls (e.g. http.fetch in
// M2-T06) should add their own side-effect import here *below* this line so
// registration order keeps them winning.
import "../impls/_stubs";
// Real impls registered after stubs — last registration wins.
import "../impls/httpFetch";
import "../impls/memorySearch";

/**
 * Central dispatcher for every tool call. Pipeline:
 *
 *   1. Look up the catalog entry → short-circuit `Unknown tool` if missing.
 *   2. Confirmation gate: catalog `sideEffect === "write"` OR a dangerous
 *      arg pattern (rm -rf, sudo, curl | sh, …) returns
 *      `{requireConfirmation, preview}` without ever invoking the impl.
 *      Real human-in-loop wiring lands in M3-T11.
 *   3. Look up the impl → format "Unknown tool" if none registered.
 *   4. Run the impl inside a fresh `AbortController` so we have somewhere
 *      to plumb timeouts / upstream cancellations from future callers.
 *   5. Return a structured MCP-style result so the AI SDK surfaces the
 *      failure in the model context without retrying.
 *
 * Every call emits a single JSON audit line to `console.log` with
 * `{type:"skills.invoke", skillKey, status, durationMs, ...}` so Convex
 * log search can slice by skill. Durable audit table lands in M4-T08.
 */

type InvokeResult =
	| ToolResult
	| {
			requireConfirmation: true;
			preview: { skillKey: string; args: unknown };
	  };

const invoke = internalAction({
	args: {
		skillKey: v.string(),
		args: v.any(),
		toolCallId: v.string(),
		scope: v.object({
			orgId: v.string(),
			agentId: v.id("agents"),
			threadId: v.id("threads"),
			agentThreadId: v.string(),
			userId: v.union(v.string(), v.null()),
		}),
	},
	returns: v.any(),
	handler: async (ctx, args): Promise<InvokeResult> => {
		const start = Date.now();
		const { skillKey, scope, toolCallId } = args;

		const audit = (status: string, extra: Record<string, unknown> = {}): void => {
			console.log(
				JSON.stringify({
					type: "skills.invoke",
					skillKey,
					status,
					durationMs: Date.now() - start,
					orgId: scope.orgId,
					agentId: scope.agentId,
					threadId: scope.threadId,
					toolCallId,
					...extra,
				}),
			);
		};

		// 1. Catalog lookup.
		const catalog = await ctx.runQuery(internal.skills.queries.getCatalogByKeyInternal.default, {
			key: skillKey,
		});
		if (!catalog) {
			audit("unknown");
			return formatUnknownSkill(skillKey);
		}

		// 2. Confirmation gate (declared write OR heuristic match).
		const declaredWrite = catalog.sideEffect === "write";
		const dangerous = hasDangerousArgPattern(args.args);
		if (declaredWrite || dangerous) {
			audit("requireConfirmation", {
				reason: declaredWrite ? "sideEffect=write" : "dangerousArgPattern",
			});
			return {
				requireConfirmation: true,
				preview: { skillKey, args: args.args },
			};
		}

		// 3. Impl lookup.
		const impl = getSkillImpl(skillKey);
		if (!impl) {
			audit("unknown");
			return formatUnknownSkill(skillKey);
		}

		// 4. Dispatch.
		const controller = new AbortController();
		try {
			const result = await impl(ctx, args.args, {
				signal: controller.signal,
				scope,
			});
			audit("success");
			return formatSuccess(result);
		} catch (err) {
			audit("error", { message: err instanceof Error ? err.message : String(err) });
			return formatImplError({ skillKey, err });
		}
	},
});

export default invoke;
