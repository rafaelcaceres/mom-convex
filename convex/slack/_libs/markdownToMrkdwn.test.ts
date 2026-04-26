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

	it("converts headings (#, ##, ###, ####) to *bold* lines", () => {
		expect(markdownToMrkdwn("# Title")).toBe("*Title*");
		expect(markdownToMrkdwn("## Subtitle")).toBe("*Subtitle*");
		expect(markdownToMrkdwn("### Section")).toBe("*Section*");
		expect(markdownToMrkdwn("#### Nested")).toBe("*Nested*");
	});

	it("strips trailing `#` markers from headings", () => {
		expect(markdownToMrkdwn("## Title ##")).toBe("*Title*");
	});

	it("converts headings inside multi-line content without touching body", () => {
		const input = "intro\n### Script criado (`fibonacci.py`)\nbody";
		const output = markdownToMrkdwn(input);
		expect(output).toContain("*Script criado (`fibonacci.py`)*");
		expect(output).toContain("intro");
		expect(output).toContain("body");
		expect(output).not.toContain("###");
	});

	it("does not treat `#` inside code fences as a heading", () => {
		const input = "```\n# not a heading\n```";
		expect(markdownToMrkdwn(input)).toContain("# not a heading");
	});

	it("does not let bullet `* ` markers swallow a line as italic and break adjacent **bold** pairs", () => {
		const input = [
			"List:",
			"* **Michel Foucault (Poder, Conhecimento e Discurso)** — descrição",
			"* **Gilles Deleuze (Multiplicidade, Devir)** — descrição",
		].join("\n");
		const output = markdownToMrkdwn(input);
		expect(output).toContain("*Michel Foucault (Poder, Conhecimento e Discurso)*");
		expect(output).toContain("*Gilles Deleuze (Multiplicidade, Devir)*");
		// No raw `**` should leak through.
		expect(output).not.toContain("**");
	});

	it("requires non-whitespace at italic boundaries (CommonMark emphasis rule)", () => {
		// `* x *` (whitespace immediately inside) is NOT italic in
		// standard markdown; leave it alone so bullets aren't swallowed.
		expect(markdownToMrkdwn("* not italic *")).toContain("* not italic *");
	});
});
