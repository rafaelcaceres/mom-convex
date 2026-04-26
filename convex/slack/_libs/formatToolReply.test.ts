import { describe, expect, it } from "vitest";
import { formatToolReply } from "./formatToolReply";

describe("F-03 formatToolReply", () => {
	it("renders a tool call with args + result", () => {
		const out = formatToolReply({
			toolName: "http.fetch",
			input: { url: "https://x.test" },
			output: { status: 200 },
			hasOutput: true,
		});
		expect(out).toContain("🔧 `http.fetch`");
		expect(out).toContain('"url": "https://x.test"');
		expect(out).toContain('"status": 200');
		expect(out).toContain("**args**");
		expect(out).toContain("**result**");
	});

	it("renders a (running…) placeholder when output is unavailable", () => {
		const out = formatToolReply({
			toolName: "http.fetch",
			input: { url: "https://x.test" },
			hasOutput: false,
		});
		expect(out).toContain("_(running…)_");
		expect(out).not.toContain("**result**");
	});

	it("renders an error block when the tool errored at dispatch time", () => {
		const out = formatToolReply({
			toolName: "broken.tool",
			input: { x: 1 },
			hasOutput: false,
			error: "unknown tool",
		});
		expect(out).toContain("**error**");
		expect(out).toContain("unknown tool");
	});

	it("renders sub-second durations as ms next to the tool name", () => {
		const out = formatToolReply({
			toolName: "http.fetch",
			input: { url: "https://x.test" },
			output: { status: 200 },
			hasOutput: true,
			durationMs: 234,
		});
		expect(out).toMatch(/^🔧 `http\.fetch` \(234ms\)/);
	});

	it("renders multi-second durations with one decimal place", () => {
		const out = formatToolReply({
			toolName: "long.tool",
			input: {},
			output: "ok",
			hasOutput: true,
			durationMs: 4321,
		});
		expect(out).toMatch(/^🔧 `long\.tool` \(4\.3s\)/);
	});

	it("omits duration when not provided or invalid", () => {
		const noDuration = formatToolReply({
			toolName: "x",
			input: {},
			output: "ok",
			hasOutput: true,
		});
		expect(noDuration).toMatch(/^🔧 `x`\n/);

		const negative = formatToolReply({
			toolName: "x",
			input: {},
			output: "ok",
			hasOutput: true,
			durationMs: -5,
		});
		expect(negative).toMatch(/^🔧 `x`\n/);
	});

	it("truncates large outputs to keep us under Slack message limits", () => {
		const big = "x".repeat(10_000);
		const out = formatToolReply({
			toolName: "http.fetch",
			input: { url: "https://x.test" },
			output: big,
			hasOutput: true,
		});
		expect(out).toContain("(truncated,");
		expect(out.length).toBeLessThan(6_000);
	});
});
