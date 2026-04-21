import { type ToolSet, dynamicTool, jsonSchema } from "ai";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";

/**
 * Bridge between our `skillCatalog` × `agentSkills` rows and the AI SDK's
 * tool-calling protocol. For each enabled binding we produce a `Tool` whose
 * `execute` delegates to the central `internal.skills.actions.invoke`
 * dispatcher (stub today, real in M2-T05).
 */

export type ResolvedSkillEntry = {
	skillKey: string;
	name: string;
	description: string;
	zodSchemaJson: string;
	sideEffect: "read" | "write";
	config?: unknown;
};

export type ToolInvokeScope = {
	orgId: string;
	agentId: Id<"agents">;
	threadId: Id<"threads">;
	agentThreadId: string;
	userId: string | null;
};

type RunAction = ActionCtx["runAction"];

/**
 * Anthropic (and some other providers) require tool names to match
 * `^[a-zA-Z0-9_-]{1,128}$`. Our catalog keys use `namespace.action` for
 * readability (`http.fetch`, `sandbox.bash`); the dot is not in the
 * allowed set. We translate dots (and any other disallowed byte) to `_`
 * when exposing tools to the model — the original `skillKey` is still
 * carried in the `execute` closure, so the dispatcher sees the canonical
 * name regardless of which wire name the model emitted.
 *
 * Collision note: two keys that differ only by `.` vs `_` would collide
 * after translation (`a.b` vs `a_b`). Today the catalog has no such pair.
 * Enforcing uniqueness post-translation at seed time is a follow-up if we
 * ever add user-authored skills.
 */
export function toolNameFromSkillKey(skillKey: string): string {
	return skillKey.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Transient-error heuristic. A tool call that dies mid-flight because the
 * downstream action timed out, got reset by the network, or hit a cold-start
 * boundary is retried exactly once. Validation and domain errors fall through
 * as-is so the model can see them.
 */
function isTransientError(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	const msg = err.message.toLowerCase();
	return (
		msg.includes("timeout") ||
		msg.includes("etimedout") ||
		msg.includes("econnreset") ||
		msg.includes("network") ||
		msg.includes("fetch failed") ||
		msg.includes("unavailable")
	);
}

async function withSingleRetry<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		if (isTransientError(err)) {
			return await fn();
		}
		throw err;
	}
}

/**
 * Pure-ish factory for a ToolSet. Takes the already-resolved entries plus a
 * runAction callback so it can be unit-tested without spinning up convex-test.
 * `resolveTools` below is the action-side wrapper that fetches entries via
 * `ctx.runQuery` and then calls this.
 */
export function buildToolSet(args: {
	entries: ResolvedSkillEntry[];
	runAction: RunAction;
	scope: ToolInvokeScope;
}): ToolSet {
	const { entries, runAction, scope } = args;
	const set: ToolSet = {};

	for (const entry of entries) {
		const parsedSchema = JSON.parse(entry.zodSchemaJson) as Parameters<typeof jsonSchema>[0];
		const toolName = toolNameFromSkillKey(entry.skillKey);
		set[toolName] = dynamicTool({
			description: entry.description,
			inputSchema: jsonSchema(parsedSchema),
			execute: async (input, options) => {
				return await withSingleRetry(() =>
					runAction(internal.skills.actions.invoke.default, {
						skillKey: entry.skillKey,
						args: input,
						toolCallId: options.toolCallId,
						scope: {
							orgId: scope.orgId,
							agentId: scope.agentId,
							threadId: scope.threadId,
							agentThreadId: scope.agentThreadId,
							userId: scope.userId,
						},
					}),
				);
			},
		});
	}

	return set;
}

/**
 * Production entry point. Called from `handleIncoming` (or any other action
 * that drives the agent) right before `streamText`. A single `runQuery`
 * fetches all enabled bindings in one transaction so the toolset is
 * consistent with what the admin saw when they last toggled a skill.
 */
export async function resolveTools(ctx: ActionCtx, scope: ToolInvokeScope): Promise<ToolSet> {
	const entries = await ctx.runQuery(internal.skills.queries.listResolvedForAgentInternal.default, {
		agentId: scope.agentId,
	});
	return buildToolSet({
		entries,
		runAction: ctx.runAction.bind(ctx),
		scope,
	});
}
