import { describe, expect, it } from "vitest";
import { formatReasoningReply } from "./formatReasoningReply";

describe("F-03 formatReasoningReply", () => {
	it("renders a reasoning header + body", () => {
		const out = formatReasoningReply("First I'll fetch the page, then summarize.");
		expect(out).toContain("🧠 **reasoning**");
		expect(out).toContain("First I'll fetch the page, then summarize.");
	});

	it("trims surrounding whitespace", () => {
		const out = formatReasoningReply("\n\n  let me think  \n\n");
		expect(out).toContain("let me think");
		expect(out).not.toMatch(/let me think\s*\n\s*\n/);
	});

	it("truncates long reasoning to keep us under Slack message limits", () => {
		const big = "x".repeat(10_000);
		const out = formatReasoningReply(big);
		expect(out).toContain("(truncated,");
		expect(out.length).toBeLessThan(3_000);
	});
});
