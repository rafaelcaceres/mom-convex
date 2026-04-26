import { describe, expect, it, vi } from "vitest";
import { buildReasoningSnippet, createSlackPainter } from "./slackPainter";

type PostCall = {
	botToken: string;
	channel: string;
	threadTs?: string;
	text: string;
};
type UpdateCall = { botToken: string; channel: string; ts: string; text: string };

interface Harness {
	posts: PostCall[];
	updates: UpdateCall[];
	persisted: string[];
	resolveNextPost: () => void;
	resolveNextUpdate: () => void;
	pendingPosts: number;
	pendingUpdates: number;
}

/**
 * Default mode resolves Slack calls instantly. Use `manualResolve: true`
 * to drive timing yourself via `resolveNextPost` / `resolveNextUpdate`.
 */
function makeHarness(opts?: { failNthPost?: number; manualResolve?: boolean }) {
	const posts: PostCall[] = [];
	const updates: UpdateCall[] = [];
	const persisted: string[] = [];
	let postCounter = 0;
	const pendingPostResolvers: Array<() => void> = [];
	const pendingUpdateResolvers: Array<() => void> = [];

	const postFn = vi.fn(async (a: PostCall) => {
		postCounter += 1;
		posts.push(a);
		if (opts?.failNthPost === postCounter) throw new Error("simulated post failure");
		const ts = `100${postCounter}.000${postCounter}`;
		if (opts?.manualResolve) {
			await new Promise<void>((resolve) => {
				pendingPostResolvers.push(resolve);
			});
		}
		return ts;
	});
	const updateFn = vi.fn(async (a: UpdateCall) => {
		updates.push(a);
		if (opts?.manualResolve) {
			await new Promise<void>((resolve) => {
				pendingUpdateResolvers.push(resolve);
			});
		}
	});
	const persistMainTs = vi.fn(async (ts: string) => {
		persisted.push(ts);
	});

	const painter = createSlackPainter({
		botToken: "xoxb-test",
		channelId: "C1",
		threadTs: "1.0",
		persistMainTs,
		postFn,
		updateFn,
	});

	const harness: Harness = {
		posts,
		updates,
		persisted,
		resolveNextPost: () => pendingPostResolvers.shift()?.(),
		resolveNextUpdate: () => pendingUpdateResolvers.shift()?.(),
		get pendingPosts() {
			return pendingPostResolvers.length;
		},
		get pendingUpdates() {
			return pendingUpdateResolvers.length;
		},
	};

	return { painter, harness };
}

async function flush() {
	// Flush microtasks several times to let promise chains settle.
	for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe("F-04 createSlackPainter", () => {
	it("start() eagerly posts an italic 'thinking...' placeholder and resolves with mainTs", async () => {
		const { painter, harness } = makeHarness();
		const ts = await painter.start();

		expect(ts).toBe("1001.0001");
		expect(harness.posts).toHaveLength(1);
		expect(harness.posts[0]?.text).toBe("_thinking..._");
		expect(harness.persisted).toEqual(["1001.0001"]);
		expect(painter.getMainTs()).toBe("1001.0001");
	});

	it("placeholder is dropped on the first real content event", async () => {
		const { painter, harness } = makeHarness();
		await painter.start();
		expect(harness.posts[0]?.text).toBe("_thinking..._");

		painter.appendText("hello");
		await flush();
		const lastUpdate = harness.updates.at(-1);
		expect(lastUpdate?.text).not.toContain("thinking");
		expect(lastUpdate?.text).toContain("hello");
	});

	it("first appendText posts via chat.postMessage and persists ts", async () => {
		const { painter, harness } = makeHarness();
		painter.appendText("hello");
		await painter.flushFinal("hello world");

		expect(harness.posts).toHaveLength(1);
		const firstPost = harness.posts[0];
		expect(firstPost).toMatchObject({ channel: "C1", threadTs: "1.0" });
		expect(firstPost?.text).toContain("hello");
		expect(firstPost?.text).toContain("…"); // working indicator
		expect(harness.persisted).toEqual(["1001.0001"]);
		expect(harness.updates).toHaveLength(1);
		expect(harness.updates[0]?.text).toBe("hello world");
	});

	it("coalesces deltas arriving while a write is in flight", async () => {
		const { painter, harness } = makeHarness({ manualResolve: true });
		painter.appendText("a");
		await flush();
		// First post is in flight (manualResolve gates it).
		expect(harness.posts).toHaveLength(1);
		expect(harness.pendingPosts).toBe(1);

		// These deltas land while writeInFlight=true → all batch into dirty.
		painter.appendText("b");
		painter.appendText("c");
		painter.appendText("d");
		await flush();
		expect(harness.updates).toHaveLength(0);

		// Resolve the post — chain completes, sees dirty=true, fires ONE update
		// carrying the cumulative state.
		harness.resolveNextPost();
		await flush();
		expect(harness.updates).toHaveLength(1);
		expect(harness.updates[0]?.text).toContain("abcd");

		harness.resolveNextUpdate();
		await flush();
	});

	it("emits new write per discrete event when no write is in flight", async () => {
		const { painter, harness } = makeHarness();
		painter.appendText("a");
		await flush();
		expect(harness.posts).toHaveLength(1);

		painter.appendText("b");
		await flush();
		expect(harness.updates).toHaveLength(1);

		painter.appendText("c");
		await flush();
		expect(harness.updates).toHaveLength(2);
	});

	it("markToolStart adds an inline marker on the next write", async () => {
		const { painter, harness } = makeHarness();
		painter.markToolStart({ toolCallId: "call_1", toolName: "bash" });
		await flush();
		expect(harness.posts[0]?.text).toContain("_→ bash_");
	});

	it("markToolEnd flips the running marker to ✓ in place", async () => {
		const { painter, harness } = makeHarness();
		painter.markToolStart({ toolCallId: "call_1", toolName: "bash" });
		await flush();
		expect(harness.posts[0]?.text).toContain("_→ bash_");

		painter.markToolEnd({ toolCallId: "call_1", ok: true });
		await flush();

		const last = harness.updates.at(-1);
		expect(last?.text).toContain("_✓ bash_");
		expect(last?.text).not.toContain("_→ bash_");
	});

	it("markToolEnd with ok=false renders ✗", async () => {
		const { painter, harness } = makeHarness();
		painter.markToolStart({ toolCallId: "call_1", toolName: "http.fetch" });
		painter.markToolEnd({ toolCallId: "call_1", ok: false });
		await flush();

		const lastText = harness.updates.at(-1)?.text ?? harness.posts.at(-1)?.text;
		expect(lastText).toContain("_✗ http.fetch_");
	});

	it("interleaves tool markers between text segments chronologically", async () => {
		const { painter, harness } = makeHarness();
		painter.appendText("step1 ");
		await flush();
		painter.markToolStart({ toolCallId: "c1", toolName: "bash" });
		painter.markToolEnd({ toolCallId: "c1", ok: true });
		await flush();
		painter.appendText("step2");
		await flush();

		const lastLive = harness.updates.at(-1)?.text ?? "";
		const idxStep1 = lastLive.indexOf("step1");
		const idxBash = lastLive.indexOf("bash");
		const idxStep2 = lastLive.indexOf("step2");
		expect(idxStep1).toBeGreaterThanOrEqual(0);
		expect(idxBash).toBeGreaterThan(idxStep1);
		expect(idxStep2).toBeGreaterThan(idxBash);

		await painter.flushFinal("done");
	});

	it("flushFinal replaces the live message with final text and removes working indicator", async () => {
		const { painter, harness } = makeHarness();
		painter.appendText("partial");
		await flush();
		await painter.flushFinal("**Final answer**");

		const last = harness.updates.at(-1);
		expect(last?.text).toBe("**Final answer**");
		expect(last?.text).not.toContain("…");
		expect(last?.text).not.toContain("partial");
	});

	it("flushFinal posts via chat.postMessage when no chunks happened (empty stream)", async () => {
		const { painter, harness } = makeHarness();
		await painter.flushFinal("only message");

		expect(harness.posts).toHaveLength(1);
		expect(harness.posts[0]?.text).toBe("only message");
		expect(harness.persisted).toEqual(["1001.0001"]);
		expect(harness.updates).toHaveLength(0);
	});

	it("flushFinal splits oversized text: first chunk via update, rest as thread replies on mainTs", async () => {
		const { painter, harness } = makeHarness();
		painter.appendText("partial");
		await flush();
		// mainTs captured by the first post.
		expect(painter.getMainTs()).toBe("1001.0001");

		const huge = "x".repeat(12_000);
		await painter.flushFinal(huge);

		// First chunk replaces the live message via chat.update on mainTs.
		expect(harness.updates.length).toBeGreaterThanOrEqual(1);
		const lastUpdate = harness.updates.at(-1);
		expect(lastUpdate?.ts).toBe("1001.0001");
		expect(lastUpdate?.text.length).toBeLessThanOrEqual(3900);
		expect(lastUpdate?.text).toMatch(/_\(continua 1\/\d+\)_$/);

		// Continuations posted as thread replies anchored on mainTs.
		const continuationPosts = harness.posts.filter((p) => p.threadTs === "1001.0001");
		expect(continuationPosts.length).toBeGreaterThanOrEqual(1);
		for (const p of continuationPosts) {
			expect(p.text.length).toBeLessThanOrEqual(3900);
		}
		// Last continuation carries the "fim" suffix.
		expect(continuationPosts.at(-1)?.text).toMatch(/_\(fim \d+\/\d+\)_$/);
	});

	it("flushFinal does NOT post continuations when text fits in one chunk", async () => {
		const { painter, harness } = makeHarness();
		painter.appendText("partial");
		await flush();
		const postsBefore = harness.posts.length;
		await painter.flushFinal("short final text");

		expect(harness.posts.length).toBe(postsBefore);
		expect(harness.updates.at(-1)?.text).toBe("short final text");
	});

	it("ignores events after flushFinal", async () => {
		const { painter, harness } = makeHarness();
		painter.appendText("a");
		await flush();
		await painter.flushFinal("done");
		const writesBefore = harness.posts.length + harness.updates.length;

		painter.appendText("ignored");
		painter.markToolStart({ toolCallId: "x", toolName: "bash" });
		await flush();

		expect(harness.posts.length + harness.updates.length).toBe(writesBefore);
	});

	it("setWorking(false) drops the … indicator on the next flush", async () => {
		const { painter, harness } = makeHarness();
		painter.appendText("hello");
		await flush();
		expect(harness.posts[0]?.text).toContain("…");

		painter.setWorking(false);
		painter.markToolStart({ toolCallId: "c1", toolName: "bash" });
		await flush();
		expect(harness.updates.at(-1)?.text).not.toContain("…");
	});

	it("markReasoning appends an italic snippet line", async () => {
		const { painter, harness } = makeHarness();
		painter.markReasoning("planning the next step");
		await flush();

		expect(harness.posts[0]?.text).toContain("_planning the next step_");
	});

	it("does not duplicate the working indicator when setWorking is a no-op", async () => {
		const { painter, harness } = makeHarness();
		painter.appendText("a");
		painter.setWorking(true); // already working — no-op
		await flush();
		const ellipsisCount = (harness.posts[0]?.text.match(/…/g) ?? []).length;
		expect(ellipsisCount).toBe(1);
	});

	it("converts markdown to mrkdwn in text segments (e.g. **bold** → *bold*)", async () => {
		const { painter, harness } = makeHarness();
		painter.appendText("hello **world**");
		await flush();
		expect(harness.posts[0]?.text).toContain("*world*");
		expect(harness.posts[0]?.text).not.toContain("**world**");
	});

	it("strips markdown from reasoning snippet so asterisks don't leak inside the italic wrapper", async () => {
		const { painter, harness } = makeHarness();
		painter.markReasoning("**Locating Lacan's Question**");
		await flush();
		const text = harness.posts[0]?.text ?? "";
		expect(text).toContain("_Locating Lacan's Question_");
		expect(text).not.toContain("**");
	});

	it("converts bold pairs that span text-segment boundaries (text → tool → text)", async () => {
		const { painter, harness } = makeHarness();
		painter.appendText("**Hello ");
		painter.markToolStart({ toolCallId: "c1", toolName: "bash" });
		painter.appendText("world**");
		await flush();

		const last = harness.updates.at(-1)?.text ?? harness.posts.at(-1)?.text ?? "";
		// After single-pass conversion, the bold pair across the tool
		// marker resolves to mrkdwn `*Hello ... world*` (joined by the
		// marker line in the middle).
		expect(last).not.toContain("**");
	});

	it("write failures are swallowed so the chain keeps moving", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const { painter, harness } = makeHarness({ failNthPost: 1 });
			painter.appendText("a");
			await flush();
			expect(harness.posts).toHaveLength(1);
			expect(warn).toHaveBeenCalled();

			// Subsequent writes continue. mainTs stayed null because the first
			// post threw, so the next write retries as another postMessage.
			painter.appendText("b");
			await flush();
			expect(harness.posts.length).toBeGreaterThanOrEqual(1);
		} finally {
			warn.mockRestore();
		}
	});
});

describe("F-04 buildReasoningSnippet", () => {
	it("returns the first non-empty line trimmed", () => {
		expect(buildReasoningSnippet("\n  hello world  \nrest")).toBe("hello world");
	});

	it("truncates long lines at 120 chars with ellipsis", () => {
		const long = "a".repeat(200);
		const out = buildReasoningSnippet(long);
		expect(out.length).toBe(120);
		expect(out.endsWith("…")).toBe(true);
	});

	it("returns empty string for empty input", () => {
		expect(buildReasoningSnippet("")).toBe("");
		expect(buildReasoningSnippet("   \n  \n")).toBe("");
	});
});
