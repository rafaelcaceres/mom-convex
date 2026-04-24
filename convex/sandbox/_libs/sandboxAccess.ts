"use node";

import { internal } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import type { ToolInvokeScope } from "../../skills/_libs/resolveTools";
import {
	DefaultSandboxClient,
	type ISandboxClient,
	type SandboxRepoDeps,
	getOrCreateSandbox,
} from "./vercel";

/**
 * Action-side bridge between sandbox skill impls (M2-T12) and the pure
 * orchestration in `vercel.ts`. Resolves both an `ISandboxClient` (defaults
 * to the real Vercel-backed impl, swappable for tests) and a `SandboxRepoDeps`
 * constructed from the action's `ctx` so the skill doesn't have to thread
 * `runQuery`/`runMutation` plumbing every call.
 *
 * Test injection uses module-level overrides rather than passing args
 * through the skill impl signature — impls register into a singleton at
 * module load, so exposing mock hooks via the impl API would force every
 * caller to carry dependency types they don't otherwise need.
 */

let __testClientOverride: ISandboxClient | null = null;
let __testRepoOverride: SandboxRepoDeps | null = null;

/**
 * Swap the default Vercel-backed client for a mock. Pass `null` to restore
 * production behavior. Paired with `_setSandboxRepoOverride` for full test
 * isolation (no Convex DB required).
 */
export function _setSandboxClientOverride(client: ISandboxClient | null): void {
	__testClientOverride = client;
}

/**
 * Swap the DB-backed repo deps for a mock set. Paired with the client
 * override — if only one is set, the default fills the other slot.
 */
export function _setSandboxRepoOverride(repo: SandboxRepoDeps | null): void {
	__testRepoOverride = repo;
}

function repoFromCtx(ctx: ActionCtx): SandboxRepoDeps {
	return {
		getByThread: (threadId) =>
			ctx.runQuery(internal.sandbox.queries.getByThreadInternal.default, { threadId }),
		registerSandbox: (args) =>
			ctx.runMutation(internal.sandbox.mutations.registerSandbox.default, args),
		markUsed: async (args) => {
			await ctx.runMutation(internal.sandbox.mutations.markUsedInternal.default, args);
		},
		markDestroyed: async (id) => {
			await ctx.runMutation(internal.sandbox.mutations.markDestroyedInternal.default, { id });
		},
	};
}

export async function getSandboxForScope(
	ctx: ActionCtx,
	scope: ToolInvokeScope,
): Promise<{ client: ISandboxClient; sandboxId: string }> {
	const client = __testClientOverride ?? DefaultSandboxClient;
	const repo = __testRepoOverride ?? repoFromCtx(ctx);
	const result = await getOrCreateSandbox({
		client,
		repo,
		orgId: scope.orgId,
		threadId: scope.threadId,
		now: Date.now(),
	});
	return { client, sandboxId: result.sandboxId };
}
