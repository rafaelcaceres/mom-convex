import type {
	Blockquote,
	Code,
	Heading,
	List,
	Paragraph,
	PhrasingContent,
	Root,
	RootContent,
	Table,
} from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

/**
 * Markdown → Slack Block Kit `rich_text` block converter.
 *
 * Sending a single `rich_text` block (with multiple inner elements) via
 * `chat.postMessage`'s `blocks` field bypasses Slack's mrkdwn text parser
 * entirely — the client renders our AST verbatim. This eliminates the
 * whole class of formatting bugs that come from string-level mrkdwn
 * (asterisk-vs-underscore conflicts, nested emphasis, half-streamed pairs,
 * heading/table/HR fallthrough).
 *
 * The agent stays platform-agnostic: it emits standard markdown (or GFM),
 * we translate here. Tables — which Slack has no native equivalent for —
 * are rendered as a bullet list with `*column1:* value, column2: value …`
 * so the data stays legible without breaking the visual flow.
 */

export interface SlackTextStyle {
	bold?: boolean;
	italic?: boolean;
	strike?: boolean;
	code?: boolean;
}

export type SlackSectionElement =
	| { type: "text"; text: string; style?: SlackTextStyle }
	| { type: "link"; url: string; text?: string; style?: SlackTextStyle }
	| { type: "user"; user_id: string }
	| { type: "emoji"; name: string };

export interface SlackRichTextSection {
	type: "rich_text_section";
	elements: SlackSectionElement[];
}

export interface SlackRichTextList {
	type: "rich_text_list";
	style: "bullet" | "ordered";
	indent: number;
	elements: SlackRichTextSection[];
}

export interface SlackRichTextPreformatted {
	type: "rich_text_preformatted";
	elements: SlackSectionElement[];
}

export interface SlackRichTextQuote {
	type: "rich_text_quote";
	elements: SlackSectionElement[];
}

export type SlackRichTextElement =
	| SlackRichTextSection
	| SlackRichTextList
	| SlackRichTextPreformatted
	| SlackRichTextQuote;

export interface SlackRichTextBlock {
	type: "rich_text";
	elements: SlackRichTextElement[];
}

export interface MarkdownToRichTextOptions {
	/** username → Slack user_id; matched on `@username` text spans. */
	userMap?: Record<string, string>;
}

const processor = unified().use(remarkParse).use(remarkGfm);

export function markdownToRichText(
	md: string,
	options: MarkdownToRichTextOptions = {},
): SlackRichTextBlock | null {
	if (!md.trim()) return null;
	const tree = processor.parse(md) as Root;
	const elements: SlackRichTextElement[] = [];
	for (const child of tree.children) {
		renderBlock(child, elements, options);
	}
	if (elements.length === 0) return null;
	return { type: "rich_text", elements };
}

function renderBlock(
	node: RootContent,
	out: SlackRichTextElement[],
	opts: MarkdownToRichTextOptions,
): void {
	switch (node.type) {
		case "paragraph": {
			const elements = renderInline((node as Paragraph).children, opts);
			if (elements.length > 0) out.push({ type: "rich_text_section", elements });
			return;
		}
		case "heading": {
			// Slack rich_text has no headings — render as a bold-only section so it
			// still reads as a section title.
			const inline = renderInline((node as Heading).children, opts);
			const bolded = inline.map((el) => forceBold(el));
			if (bolded.length > 0) out.push({ type: "rich_text_section", elements: bolded });
			return;
		}
		case "list": {
			flattenList(node as List, 0, out, opts);
			return;
		}
		case "code": {
			const codeNode = node as Code;
			const text = codeNode.value;
			if (text.length > 0) {
				out.push({
					type: "rich_text_preformatted",
					elements: [{ type: "text", text }],
				});
			}
			return;
		}
		case "blockquote": {
			const inline = flattenBlockquote(node as Blockquote, opts);
			if (inline.length > 0) out.push({ type: "rich_text_quote", elements: inline });
			return;
		}
		case "thematicBreak":
			// `---` / `***` / `___` — no native equivalent. Skip; surrounding blocks
			// already provide spacing.
			return;
		case "table": {
			tableAsList(node as Table, out, opts);
			return;
		}
		case "html": {
			// Pass the literal HTML through as text rather than rendering it.
			const value = (node as { value?: string }).value ?? "";
			if (value.length > 0)
				out.push({ type: "rich_text_section", elements: [{ type: "text", text: value }] });
			return;
		}
		default:
			return;
	}
}

function renderInline(
	nodes: PhrasingContent[],
	opts: MarkdownToRichTextOptions,
	style: SlackTextStyle = {},
): SlackSectionElement[] {
	const out: SlackSectionElement[] = [];
	for (const node of nodes) {
		switch (node.type) {
			case "text":
				appendText(out, node.value, style, opts);
				break;
			case "strong":
				out.push(...renderInline(node.children, opts, { ...style, bold: true }));
				break;
			case "emphasis":
				out.push(...renderInline(node.children, opts, { ...style, italic: true }));
				break;
			case "delete":
				out.push(...renderInline(node.children, opts, { ...style, strike: true }));
				break;
			case "inlineCode":
				out.push({ type: "text", text: node.value, style: cleanStyle({ ...style, code: true }) });
				break;
			case "link": {
				const text = phrasingToString(node.children).trim();
				out.push({
					type: "link",
					url: node.url,
					...(text.length > 0 ? { text } : {}),
					...(hasStyle(style) ? { style: cleanStyle(style) } : {}),
				});
				break;
			}
			case "break":
				out.push({ type: "text", text: "\n" });
				break;
			case "image": {
				const alt = node.alt ?? "";
				out.push({ type: "link", url: node.url, ...(alt ? { text: alt } : {}) });
				break;
			}
			default:
				// Anything else (footnoteReference, html, etc.) → degrade to its
				// visible string form so we never lose user-written content.
				out.push({ type: "text", text: phrasingToString([node]) });
		}
	}
	return mergeAdjacentText(out);
}

function appendText(
	out: SlackSectionElement[],
	value: string,
	style: SlackTextStyle,
	opts: MarkdownToRichTextOptions,
): void {
	if (value.length === 0) return;
	// Walk the string splitting out `@username` spans (resolved via userMap to
	// proper user elements) and `:shortcode:` Slack emoji into native emoji
	// elements. Unmatched mentions stay as plain text — same graceful-
	// degradation rule as the legacy `markdownToMrkdwn`. Emoji parsing always
	// runs (independent of userMap) because Slack only renders shortcodes when
	// they arrive as `{ type: "emoji" }` block elements; inside `text` they
	// stay literal `:slightly_smiling_face:`.
	const userMap = opts.userMap;
	const styled = hasStyle(style) ? { style: cleanStyle(style) } : {};
	const pushText = (text: string) => {
		if (text.length === 0) return;
		out.push({ type: "text", text, ...styled });
	};
	const re = /@([A-Za-z0-9_.-]+)|:([a-z0-9_+-]+):/g;
	let lastIndex = 0;
	for (const m of value.matchAll(re)) {
		const idx = m.index ?? 0;
		if (idx > lastIndex) pushText(value.slice(lastIndex, idx));
		if (m[1] !== undefined) {
			// mention
			const username = m[1];
			const userId = userMap?.[username];
			if (userId) out.push({ type: "user", user_id: userId });
			else pushText(m[0]);
		} else if (m[2] !== undefined) {
			// emoji shortcode
			out.push({ type: "emoji", name: m[2] });
		}
		lastIndex = idx + m[0].length;
	}
	if (lastIndex < value.length) pushText(value.slice(lastIndex));
}

function flattenList(
	node: List,
	indent: number,
	out: SlackRichTextElement[],
	opts: MarkdownToRichTextOptions,
): void {
	const ordered = node.ordered === true;
	let buffer: SlackRichTextSection[] = [];
	const flush = () => {
		if (buffer.length === 0) return;
		out.push({
			type: "rich_text_list",
			style: ordered ? "ordered" : "bullet",
			indent,
			elements: buffer,
		});
		buffer = [];
	};
	for (const item of node.children) {
		const elements: SlackSectionElement[] = [];
		const nestedLists: List[] = [];
		for (const child of item.children) {
			if (child.type === "paragraph") {
				if (elements.length > 0) elements.push({ type: "text", text: "\n" });
				elements.push(...renderInline(child.children, opts));
			} else if (child.type === "list") {
				nestedLists.push(child);
			} else if (child.type === "code") {
				// Code blocks inside list items can't be rich_text_preformatted (lists
				// only contain sections). Fold them into the section as inline-code text.
				if (elements.length > 0) elements.push({ type: "text", text: "\n" });
				elements.push({ type: "text", text: child.value, style: { code: true } });
			}
		}
		buffer.push({ type: "rich_text_section", elements });
		if (nestedLists.length > 0) {
			flush();
			for (const nl of nestedLists) flattenList(nl, indent + 1, out, opts);
		}
	}
	flush();
}

function flattenBlockquote(node: Blockquote, opts: MarkdownToRichTextOptions): SlackSectionElement[] {
	const out: SlackSectionElement[] = [];
	for (const child of node.children) {
		if (child.type === "paragraph") {
			if (out.length > 0) out.push({ type: "text", text: "\n" });
			out.push(...renderInline(child.children, opts));
		}
	}
	return out;
}

function tableAsList(
	node: Table,
	out: SlackRichTextElement[],
	opts: MarkdownToRichTextOptions,
): void {
	const headerRow = node.children[0];
	if (!headerRow) return;
	const bodyRows = node.children.slice(1);
	const headers = headerRow.children.map((c) => phrasingToString(c.children).trim());
	const sections: SlackRichTextSection[] = [];
	for (const row of bodyRows) {
		const elements: SlackSectionElement[] = [];
		for (let i = 0; i < row.children.length; i++) {
			const cell = row.children[i];
			if (!cell) continue;
			const header = headers[i] ?? "";
			const valueInline = renderInline(cell.children, opts);
			if (i > 0) elements.push({ type: "text", text: "  " });
			if (header) {
				elements.push({ type: "text", text: `${header}: `, style: { bold: true } });
			}
			elements.push(...valueInline);
		}
		sections.push({ type: "rich_text_section", elements });
	}
	if (sections.length > 0) {
		out.push({ type: "rich_text_list", style: "bullet", indent: 0, elements: sections });
	}
}

function phrasingToString(nodes: PhrasingContent[]): string {
	const parts: string[] = [];
	for (const n of nodes) {
		// @ts-expect-error — value/children present on the relevant subset.
		if (typeof n.value === "string") parts.push(n.value);
		// @ts-expect-error — see above.
		else if (Array.isArray(n.children)) parts.push(phrasingToString(n.children));
	}
	return parts.join("");
}

function forceBold(el: SlackSectionElement): SlackSectionElement {
	if (el.type === "text") return { ...el, style: cleanStyle({ ...(el.style ?? {}), bold: true }) };
	if (el.type === "link") return { ...el, style: cleanStyle({ ...(el.style ?? {}), bold: true }) };
	return el;
}

function hasStyle(style: SlackTextStyle): boolean {
	return Boolean(style.bold || style.italic || style.strike || style.code);
}

function cleanStyle(style: SlackTextStyle): SlackTextStyle | undefined {
	const out: SlackTextStyle = {};
	if (style.bold) out.bold = true;
	if (style.italic) out.italic = true;
	if (style.strike) out.strike = true;
	if (style.code) out.code = true;
	return Object.keys(out).length > 0 ? out : undefined;
}

function mergeAdjacentText(elements: SlackSectionElement[]): SlackSectionElement[] {
	const out: SlackSectionElement[] = [];
	for (const el of elements) {
		const prev = out[out.length - 1];
		if (
			prev &&
			prev.type === "text" &&
			el.type === "text" &&
			styleEq(prev.style, el.style)
		) {
			out[out.length - 1] = { ...prev, text: prev.text + el.text };
		} else {
			out.push(el);
		}
	}
	return out;
}

function styleEq(a: SlackTextStyle | undefined, b: SlackTextStyle | undefined): boolean {
	const x = a ?? {};
	const y = b ?? {};
	return (
		Boolean(x.bold) === Boolean(y.bold) &&
		Boolean(x.italic) === Boolean(y.italic) &&
		Boolean(x.strike) === Boolean(y.strike) &&
		Boolean(x.code) === Boolean(y.code)
	);
}
