import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import type { ToolInvokeScope } from "../_libs/resolveTools";
import { memorySearchImpl } from "./memorySearch";

type MemoryRow = {
	_id: string;
	_creationTime: number;
	orgId: string;
	scope: "org" | "agent" | "thread";
	content: string;
	alwaysOn: boolean;
	updatedBy: string;
	updatedAt: number;
	agentId?: string;
	threadId?: string;
	embedding?: number[];
};

function makeCtx(rows: MemoryRow[]) {
	const runQuery = vi.fn(async () => rows);
	return {
		ctx: { runQuery } as unknown as ActionCtx,
		runQuery,
	};
}

const scope: ToolInvokeScope = {
	orgId: "org_A",
	agentId: "agents_placeholder" as unknown as Id<"agents">,
	threadId: "threads_placeholder" as unknown as Id<"threads">,
	agentThreadId: "agentThread_1",
	userId: null,
};

function opts() {
	return { signal: new AbortController().signal, scope };
}

function row(overrides: Partial<MemoryRow>): MemoryRow {
	return {
		_id: "mem_default",
		_creationTime: 1,
		orgId: "org_A",
		scope: "org",
		content: "placeholder",
		alwaysOn: true,
		updatedBy: "u_1",
		updatedAt: 100,
		...overrides,
	};
}

describe("M2-T08 memory.search impl", () => {
	it("returns a memory whose content contains the query (case-insensitive)", async () => {
		const { ctx } = makeCtx([
			row({ _id: "mem_py", content: "User prefers Python over Ruby for data work." }),
			row({ _id: "mem_ts", content: "TypeScript is the house language." }),
		]);

		const result = (await memorySearchImpl(ctx, { query: "Python" }, opts())) as Array<{
			_id: string;
			content: string;
		}>;

		expect(result).toHaveLength(1);
		expect(result[0]?._id).toBe("mem_py");
		expect(result[0]?.content).toMatch(/Python/);
	});

	it('scope="memory" queries the memory table (single runQuery call)', async () => {
		const { ctx, runQuery } = makeCtx([row({ _id: "mem_py", content: "python rocks" })]);

		const result = (await memorySearchImpl(
			ctx,
			{ query: "python", scope: "memory" },
			opts(),
		)) as Array<unknown>;

		expect(runQuery).toHaveBeenCalledTimes(1);
		expect(result).toHaveLength(1);
	});

	it('scope="history" returns [] in M2 (RAG lands in M3-T04)', async () => {
		const { ctx, runQuery } = makeCtx([row({ _id: "mem_py", content: "python" })]);

		const result = (await memorySearchImpl(
			ctx,
			{ query: "python", scope: "history" },
			opts(),
		)) as Array<unknown>;

		expect(runQuery).not.toHaveBeenCalled();
		expect(result).toEqual([]);
	});

	it('scope="all" combines sources (stub: memory only in M2)', async () => {
		const { ctx, runQuery } = makeCtx([row({ _id: "mem_py", content: "python" })]);

		const result = (await memorySearchImpl(
			ctx,
			{ query: "python", scope: "all" },
			opts(),
		)) as Array<unknown>;

		expect(runQuery).toHaveBeenCalledTimes(1);
		expect(result).toHaveLength(1);
	});

	it("caps results at limit (default 10)", async () => {
		const rows = Array.from({ length: 15 }, (_, i) =>
			row({ _id: `mem_${i}`, content: `python note ${i}` }),
		);
		const { ctx } = makeCtx(rows);

		const result = (await memorySearchImpl(ctx, { query: "python" }, opts())) as Array<unknown>;

		expect(result).toHaveLength(10);
	});

	it("respects explicit limit override", async () => {
		const rows = Array.from({ length: 8 }, (_, i) =>
			row({ _id: `mem_${i}`, content: `python ${i}` }),
		);
		const { ctx } = makeCtx(rows);

		const result = (await memorySearchImpl(
			ctx,
			{ query: "python", limit: 3 },
			opts(),
		)) as Array<unknown>;

		expect(result).toHaveLength(3);
	});

	it("non-matching query returns an empty array", async () => {
		const { ctx } = makeCtx([row({ content: "python" })]);

		const result = (await memorySearchImpl(ctx, { query: "haskell" }, opts())) as Array<unknown>;

		expect(result).toEqual([]);
	});

	it("empty query string is rejected at validation", async () => {
		const { ctx } = makeCtx([]);
		await expect(memorySearchImpl(ctx, { query: "" }, opts())).rejects.toThrow();
	});
});
