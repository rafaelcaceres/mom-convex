"use node";

import type { Sandbox } from "../domain/sandbox.model";
import { type ISandboxClient, type SandboxRepoDeps, destroySandbox } from "./vercel";

/**
 * Pure orchestration for the sandbox GC cron (M2-T16). Kept platform-free so
 * it can be unit-tested without the Node runtime / convex-test harness. The
 * action-side wrapper in `convex/sandbox/actions/gc.ts` injects the real
 * Vercel client + DB-backed repo deps.
 */

export type GcDeps = {
	client: ISandboxClient;
	repo: SandboxRepoDeps;
	listIdle: (args: { olderThanMs: number; now: number }) => Promise<Sandbox[]>;
};

export type GcInspectedRow = {
	sandboxId: string;
	threadId: string;
	lastUsedAt: number;
};

export type GcError = { sandboxId: string; message: string };

export type GcResult = {
	dryRun: boolean;
	/** Number of candidate rows returned by `listIdle`. */
	total: number;
	/** Rows whose underlying VM was stopped AND whose DB row was tombstoned. */
	destroyed: number;
	/** Rows that failed to stop — still tombstoned (destroySandbox's finally). */
	errors: GcError[];
	/** Only populated in dry-run mode. Lets the CLI show what *would* die. */
	inspected: GcInspectedRow[];
};

/**
 * Destroy every sandbox idle for longer than `olderThanMs`. Errors on a
 * single row do not abort the sweep — we log + collect + continue, so a
 * flaky Vercel API doesn't leave the rest of the queue stuck until the
 * next cron tick.
 *
 * `destroySandbox` always tombstones the DB row (even on stop failure),
 * so a partial-failure state still advances the `status=active` partition
 * forward — the same row won't reappear on the next run.
 */
export async function runGc(
	deps: GcDeps,
	args: { now: number; olderThanMs: number; dryRun?: boolean },
): Promise<GcResult> {
	const { client, repo, listIdle } = deps;
	const { now, olderThanMs, dryRun = false } = args;

	const rows = await listIdle({ olderThanMs, now });

	if (dryRun) {
		return {
			dryRun: true,
			total: rows.length,
			destroyed: 0,
			errors: [],
			inspected: rows.map((r) => ({
				sandboxId: r.sandboxId,
				threadId: String(r.threadId),
				lastUsedAt: r.lastUsedAt,
			})),
		};
	}

	let destroyed = 0;
	const errors: GcError[] = [];

	for (const row of rows) {
		try {
			await destroySandbox({ client, repo, row });
			destroyed += 1;
			console.log(
				JSON.stringify({
					type: "sandbox.gc",
					status: "destroyed",
					sandboxId: row.sandboxId,
					threadId: String(row.threadId),
					orgId: row.orgId,
					idleMs: now - row.lastUsedAt,
				}),
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			errors.push({ sandboxId: row.sandboxId, message });
			console.warn(
				JSON.stringify({
					type: "sandbox.gc",
					status: "error",
					sandboxId: row.sandboxId,
					threadId: String(row.threadId),
					orgId: row.orgId,
					message,
				}),
			);
		}
	}

	return {
		dryRun: false,
		total: rows.length,
		destroyed,
		errors,
		inspected: [],
	};
}
