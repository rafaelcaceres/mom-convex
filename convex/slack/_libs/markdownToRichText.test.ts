import { describe, expect, it } from "vitest";
import { markdownToRichText } from "./markdownToRichText";

describe("markdownToRichText", () => {
	it("returns null for empty / whitespace-only input", () => {
		expect(markdownToRichText("")).toBeNull();
		expect(markdownToRichText("   \n  ")).toBeNull();
	});

	it("converts a plain paragraph", () => {
		const block = markdownToRichText("Hello world");
		expect(block).toEqual({
			type: "rich_text",
			elements: [
				{
					type: "rich_text_section",
					elements: [{ type: "text", text: "Hello world" }],
				},
			],
		});
	});

	it("renders bold/italic/strike/code with proper styles", () => {
		const block = markdownToRichText("**bold** and *italic* and ~~strike~~ and `code`.");
		expect(block?.elements[0]).toEqual({
			type: "rich_text_section",
			elements: [
				{ type: "text", text: "bold", style: { bold: true } },
				{ type: "text", text: " and " },
				{ type: "text", text: "italic", style: { italic: true } },
				{ type: "text", text: " and " },
				{ type: "text", text: "strike", style: { strike: true } },
				{ type: "text", text: " and " },
				{ type: "text", text: "code", style: { code: true } },
				{ type: "text", text: "." },
			],
		});
	});

	it("renders headings as bold-only sections (Slack has no rich_text headings)", () => {
		const block = markdownToRichText("### Caso 1: A vs B");
		expect(block?.elements).toEqual([
			{
				type: "rich_text_section",
				elements: [{ type: "text", text: "Caso 1: A vs B", style: { bold: true } }],
			},
		]);
	});

	it("renders links with url + label", () => {
		const block = markdownToRichText("Check [Wikipedia](https://wiki.org) for more.");
		expect(block?.elements[0]).toEqual({
			type: "rich_text_section",
			elements: [
				{ type: "text", text: "Check " },
				{ type: "link", url: "https://wiki.org", text: "Wikipedia" },
				{ type: "text", text: " for more." },
			],
		});
	});

	it("renders bullet lists", () => {
		const block = markdownToRichText("- First\n- Second\n- Third");
		expect(block?.elements).toEqual([
			{
				type: "rich_text_list",
				style: "bullet",
				indent: 0,
				elements: [
					{ type: "rich_text_section", elements: [{ type: "text", text: "First" }] },
					{ type: "rich_text_section", elements: [{ type: "text", text: "Second" }] },
					{ type: "rich_text_section", elements: [{ type: "text", text: "Third" }] },
				],
			},
		]);
	});

	it("renders ordered lists", () => {
		const block = markdownToRichText("1. Pierre Bourdieu\n2. Jean Baudrillard");
		expect(block?.elements[0]).toMatchObject({
			type: "rich_text_list",
			style: "ordered",
			indent: 0,
		});
	});

	it("renders nested lists with increasing indent", () => {
		const block = markdownToRichText("- A\n  - A.1\n  - A.2\n- B");
		const lists = (block?.elements ?? []).filter(
			(e): e is Extract<NonNullable<typeof block>["elements"][number], { type: "rich_text_list" }> =>
				e.type === "rich_text_list",
		);
		const indents = lists.map((l) => l.indent);
		expect(indents).toContain(0);
		expect(indents).toContain(1);
	});

	it("renders fenced code blocks as rich_text_preformatted", () => {
		const md = "```ts\nconst x = 1;\n```";
		const block = markdownToRichText(md);
		expect(block?.elements).toEqual([
			{
				type: "rich_text_preformatted",
				elements: [{ type: "text", text: "const x = 1;" }],
			},
		]);
	});

	it("renders blockquotes", () => {
		const block = markdownToRichText("> a quote line");
		expect(block?.elements).toEqual([
			{
				type: "rich_text_quote",
				elements: [{ type: "text", text: "a quote line" }],
			},
		]);
	});

	it("drops thematic breaks (---) — Slack has no horizontal rule", () => {
		const block = markdownToRichText("Before\n\n---\n\nAfter");
		const text = JSON.stringify(block);
		expect(text).toContain("Before");
		expect(text).toContain("After");
		expect(text).not.toContain("---");
	});

	it("converts GFM tables into bullet lists with bold headers", () => {
		const md = [
			"| Aspecto | Nietzsche | Bourdieu |",
			"| --- | --- | --- |",
			"| Foco | vontade | sociologia |",
			"| Poder | criativo | simbólico |",
		].join("\n");
		const block = markdownToRichText(md);
		expect(block?.elements[0]).toMatchObject({ type: "rich_text_list", style: "bullet" });
		const json = JSON.stringify(block);
		expect(json).toContain("Aspecto:");
		expect(json).toContain("Nietzsche:");
		expect(json).toContain("vontade");
		expect(json).toContain("simbólico");
	});

	it("converts :shortcode: spans to native Slack emoji elements", () => {
		const block = markdownToRichText("Platão. :slightly_smiling_face: indeed :rocket:");
		const elements = (block?.elements[0] as { elements: unknown[] }).elements;
		expect(elements).toContainEqual({ type: "emoji", name: "slightly_smiling_face" });
		expect(elements).toContainEqual({ type: "emoji", name: "rocket" });
		// Surrounding text remains as plain text spans.
		expect(JSON.stringify(elements)).toContain("Platão.");
	});

	it("emoji parsing works without a userMap (independent of mentions)", () => {
		const block = markdownToRichText(":+1: ok :100:");
		const elements = (block?.elements[0] as { elements: unknown[] }).elements;
		expect(elements).toContainEqual({ type: "emoji", name: "+1" });
		expect(elements).toContainEqual({ type: "emoji", name: "100" });
	});

	it("resolves @username mentions to user elements when userMap matches", () => {
		const block = markdownToRichText("hi @alice and @ghost", {
			userMap: { alice: "U123" },
		});
		const elements = (block?.elements[0] as { elements: unknown[] }).elements;
		expect(elements).toContainEqual({ type: "user", user_id: "U123" });
		// Unknown username degrades to plain text.
		expect(JSON.stringify(elements)).toContain("@ghost");
	});

	it("merges adjacent same-style text spans for compactness", () => {
		const block = markdownToRichText("foo bar baz");
		const elements = (block?.elements[0] as { elements: unknown[] }).elements;
		expect(elements).toHaveLength(1);
	});

	it("preserves bold + italic combined style", () => {
		const block = markdownToRichText("***both***");
		const elements = (block?.elements[0] as { elements: { style?: object }[] }).elements;
		const styles = elements.map((e) => e.style);
		expect(styles[0]).toEqual({ bold: true, italic: true });
	});
});
