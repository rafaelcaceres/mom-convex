import { httpAction } from "../../_generated/server";

/**
 * Health check endpoint. Used by uptime checks and CI smoke.
 *
 * Returns the current deployment commit hash when running in Convex cloud
 * (from CONVEX_GIT_COMMIT_HASH). Falls back to "dev" locally.
 *
 * Note: this file imports from `_generated/server` directly by design — it is
 * the sole exception alongside `customFunctions.ts`. ESLint rule #1 only
 * restricts `mutation`, `query`, `internalMutation`, `internalQuery`,
 * `action`, `internalAction` — not `httpAction`. httpAction lives outside the
 * trigger registry because HTTP handlers are inherently out-of-band.
 */
const health = httpAction(async () => {
	const commit = process.env.CONVEX_GIT_COMMIT_HASH ?? "dev";
	return new Response(JSON.stringify({ ok: true, commit }), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
});

export default health;
