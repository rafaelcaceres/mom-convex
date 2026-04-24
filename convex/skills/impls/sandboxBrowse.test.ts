import { describe, expect, it } from "vitest";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import type { ToolInvokeScope } from "../_libs/resolveTools";
import { sandboxBrowseImpl } from "./sandboxBrowse";

const fakeCtx = {} as ActionCtx;
const fakeScope: ToolInvokeScope = {
	orgId: "org_A",
	agentId: "agents_1" as unknown as Id<"agents">,
	threadId: "threads_1" as unknown as Id<"threads">,
	agentThreadId: "agentThread_1",
	userId: null,
};

function opts() {
	return { signal: new AbortController().signal, scope: fakeScope };
}

describe("M2-T12 sandbox.browse stub", () => {
	it("returns a structured 'not implemented' note pointing at M3", async () => {
		const result = (await sandboxBrowseImpl(fakeCtx, { url: "https://example.com" }, opts())) as {
			note: string;
			availableIn: string;
		};

		expect(result.note).toMatch(/not implemented/i);
		expect(result.availableIn).toMatch(/M3/);
	});

	it("rejects invalid URLs via the zod schema", async () => {
		await expect(sandboxBrowseImpl(fakeCtx, { url: "not-a-url" }, opts())).rejects.toThrow();
	});
});
