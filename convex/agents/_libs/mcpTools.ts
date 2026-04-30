import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";

/**
 * Remote MCP integration. The `laminar` allowlist entry on `agents.toolsAllowlist`
 * opts an agent into Laminar tools (https://flow.taller.work/api/mcp). Tools come
 * back from the MCP `tools/list` call and are namespaced with `laminar_` so they
 * never collide with skill-catalog entries (which already go through
 * `toolNameFromSkillKey`).
 *
 * Token lives in `LAMINAR_MCP_TOKEN` (set via `npx convex env set`). Missing
 * token → empty toolset and a noop closer, so a misconfigured deploy degrades
 * to "MCP disabled" rather than throwing mid-turn.
 *
 * Caller MUST `await close()` in a `finally` even if `streamText` throws — the
 * underlying HTTP transport keeps a session open against the remote server and
 * leaks otherwise. Errors during `close()` are swallowed (best-effort cleanup).
 */

const LAMINAR_MCP_URL = "https://flow.taller.work/api/mcp";
const LAMINAR_PREFIX = "laminar_";

type McpHandle = {
	tools: ToolSet;
	close: () => Promise<void>;
};

const empty: McpHandle = {
	tools: {},
	close: async () => {},
};

export async function loadLaminarMcpTools(): Promise<McpHandle> {
	const token = process.env.LAMINAR_MCP_TOKEN;
	if (!token) {
		console.warn("[mcp.laminar] LAMINAR_MCP_TOKEN not set — MCP disabled");
		return empty;
	}

	let client: Awaited<ReturnType<typeof createMCPClient>>;
	try {
		client = await createMCPClient({
			name: "mom-convex",
			transport: {
				type: "http",
				url: LAMINAR_MCP_URL,
				headers: { Authorization: `Bearer ${token}` },
			},
		});
	} catch (err) {
		console.error("[mcp.laminar] handshake failed", err);
		return empty;
	}

	let raw: Record<string, unknown>;
	try {
		// `client.tools()` returns `McpToolSet<'automatic'>` whose `inputSchema`
		// is parameterized as `FlexibleSchema<never>` and structurally rejects
		// being widened to `ToolSet`. The AI SDK still accepts the merged
		// shape at the `streamText`/`streamAssistantReply` boundary, so we
		// loosen the bridge type here and cast on the way out.
		raw = (await client.tools()) as Record<string, unknown>;
	} catch (err) {
		console.error("[mcp.laminar] tools/list failed", err);
		await client.close().catch(() => undefined);
		return empty;
	}

	const tools: ToolSet = {} as ToolSet;
	for (const [name, tool] of Object.entries(raw)) {
		(tools as Record<string, unknown>)[`${LAMINAR_PREFIX}${name}`] = tool;
	}

	return {
		tools,
		close: async () => {
			try {
				await client.close();
			} catch (err) {
				console.warn("[mcp.laminar] close failed", err);
			}
		},
	};
}
