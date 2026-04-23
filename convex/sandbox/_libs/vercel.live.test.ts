import { Sandbox as VercelSandbox } from "@vercel/sandbox";
import { describe, expect, it } from "vitest";
import { DefaultSandboxClient } from "./vercel";

/**
 * Opt-in integration test. Hits the real Vercel Sandbox API, so it costs
 * money and needs a token. Skipped unless `LIVE_VERCEL=1` is set in the
 * environment. CI should NOT run this by default — gate it behind a
 * manual workflow or the release pipeline.
 *
 * Required env (also see `.env.example`):
 *   - `VERCEL_SANDBOX_TOKEN`
 *   - `VERCEL_TEAM_ID`
 *
 * Usage: `LIVE_VERCEL=1 pnpm exec vitest run convex/sandbox/_libs/vercel.live.test.ts`
 */
const runLive = process.env.LIVE_VERCEL === "1";

describe.skipIf(!runLive)("M2-T11 DefaultSandboxClient (live)", () => {
	it("create → runCommand('echo hi') → stop roundtrips against the real API", async () => {
		const client = DefaultSandboxClient;
		const tags = { orgId: "test-live", threadId: "test-thread" };

		const { sandboxId } = await client.create({ tags, timeoutMs: 2 * 60 * 1000 });
		try {
			const reconnected = await client.reconnect(sandboxId);
			expect(reconnected?.sandboxId).toBe(sandboxId);

			const vercel = await VercelSandbox.get({ sandboxId });
			const result = await vercel.runCommand("echo", ["hi"]);
			expect(result.exitCode).toBe(0);
		} finally {
			await client.stop(sandboxId);
		}
	}, 120_000);
});
