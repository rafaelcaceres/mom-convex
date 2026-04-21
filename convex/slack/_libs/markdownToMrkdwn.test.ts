import { describe, expect, it } from "vitest";
import { markdownToMrkdwn } from "./markdownToMrkdwn";

const cache = new Map([
	["alice", "U1"],
	["bob", "U2"],
]);

describe("M1-T10 markdownToMrkdwn", () => {
	it("converts **bold** to *bold*", () => {
		expect(markdownToMrkdwn("hello **world**")).toBe("hello *world*");
	});

	it("converts *italic* to _italic_", () => {
		expect(markdownToMrkdwn("hello *world*")).toBe("hello _world_");
	});

	it("keeps `inline code` as-is", () => {
		expect(markdownToMrkdwn("use `foo()` here")).toBe("use `foo()` here");
	});

	it("converts [text](url) to <url|text>", () => {
		expect(markdownToMrkdwn("see [docs](http://x)")).toBe("see <http://x|docs>");
	});

	it("resolves @username via user cache, passes through unknown", () => {
		expect(markdownToMrkdwn("hi @alice", { userMap: cache })).toBe("hi <@U1>");
		expect(markdownToMrkdwn("hi @ghost", { userMap: cache })).toBe("hi @ghost");
	});

	it("leaves triple-backtick fenced code blocks untouched", () => {
		const input = "check this:\n```\n**not bold** *not italic*\n[not link](x)\n```\nend";
		const output = markdownToMrkdwn(input);
		expect(output).toContain("**not bold**");
		expect(output).toContain("*not italic*");
		expect(output).toContain("[not link](x)");
		expect(output).toContain("end");
	});

	it("handles bold and italic together without clobbering", () => {
		expect(markdownToMrkdwn("**b** and *i*")).toBe("*b* and _i_");
	});

	it("leaves inline code spans untouched", () => {
		expect(markdownToMrkdwn("a `**raw**` b")).toBe("a `**raw**` b");
	});
});
