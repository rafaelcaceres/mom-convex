"use node";

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../customFunctions";
import { type GcResult, runGc } from "../_libs/gc";
import { DefaultSandboxClient, type ISandboxClient, type SandboxRepoDeps } from "../_libs/vercel";

/**
 * Sandbox GC cron (wired from `convex/crons.ts`). Tombstones + stops the
 * underlying Vercel VM for every `active` sandbox idle for >7 days. Runs
 * daily at 03:00 UTC so the window lines up with off-peak for both US
 * and EU workspaces.
 *
 * Architecture:
 *   - Pure orchestration lives in `_libs/gc.ts` (unit-tested without the
 *     Node runtime).
 *   - This file is `"use node"` because `@vercel/sandbox` depends on Node
 *     builtins — the runtime bleed is isolated to the outer action.
 *   - DB access goes through `ctx.runQuery` / `ctx.runMutation`, matching
 *     the sandbox skill impls (M2-T12) — this action doesn't open a DB
 *     transaction of its own.
 *
 * Test hooks (`__testClientOverride`/`__testRepoOverride`) are deliberately
 * not wired here: the action's logic is a thin wrapper, and the pure fn
 * owns the interesting branches. Integration tests would require
 * `"use node"` + the live Vercel API, which is what `LIVE_VERCEL=1` covers
 * in `_libs/vercel.live.test.ts`.
 */

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const gc = internalAction({
	args: {
		olderThanMs: v.optional(v.number()),
		dryRun: v.optional(v.boolean()),
	},
	returns: v.object({
		dryRun: v.boolean(),
		total: v.number(),
		destroyed: v.number(),
		errors: v.array(v.object({ sandboxId: v.string(), message: v.string() })),
		inspected: v.array(
			v.object({
				sandboxId: v.string(),
				threadId: v.string(),
				lastUsedAt: v.number(),
			}),
		),
	}),
	handler: async (ctx, args): Promise<GcResult> => {
		const olderThanMs = args.olderThanMs ?? SEVEN_DAYS_MS;
		const now = Date.now();

		const client: ISandboxClient = DefaultSandboxClient;
		const repo: SandboxRepoDeps = {
			getByThread: (threadId) =>
				ctx.runQuery(internal.sandbox.queries.getByThreadInternal.default, { threadId }),
			registerSandbox: (regArgs) =>
				ctx.runMutation(internal.sandbox.mutations.registerSandbox.default, regArgs),
			markUsed: async (mArgs) => {
				await ctx.runMutation(internal.sandbox.mutations.markUsedInternal.default, mArgs);
			},
			markDestroyed: async (id) => {
				await ctx.runMutation(internal.sandbox.mutations.markDestroyedInternal.default, { id });
			},
		};

		const result = await runGc(
			{
				client,
				repo,
				listIdle: (listArgs) =>
					ctx.runQuery(internal.sandbox.queries.listIdleInternal.default, listArgs),
			},
			{ now, olderThanMs, dryRun: args.dryRun ?? false },
		);

		console.log(
			JSON.stringify({
				type: "sandbox.gc",
				status: "summary",
				dryRun: result.dryRun,
				total: result.total,
				destroyed: result.destroyed,
				errorCount: result.errors.length,
			}),
		);

		return result;
	},
});

export default gc;
