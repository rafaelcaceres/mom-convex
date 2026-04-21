/**
 * Turns an arbitrary `catch` value into the MCP-style
 * `{content:[{type:"text", text}], isError:true}` shape our tools return.
 * The dispatcher *never throws* — the AI SDK surfaces whatever we return
 * as the tool call's result, so structured errors let the model recover
 * gracefully while keeping secrets out of the model context and the logs.
 */

export type ToolContent = { type: "text"; text: string };

export type ToolResult = {
	content: ToolContent[];
	isError: boolean;
};

/**
 * Redact the narrow set of patterns most likely to leak through error
 * messages. This is defense-in-depth, not a replacement for not logging
 * secrets in the first place — add new patterns here whenever a new
 * credential shape lands in the project.
 */
const SECRET_PATTERNS: Array<[RegExp, string]> = [
	[/sk-[a-zA-Z0-9_-]{10,}/g, "[REDACTED]"],
	[/xox[abrps]-[a-zA-Z0-9-]{10,}/g, "[REDACTED]"],
	[/\bBearer\s+[a-zA-Z0-9._\-+/=]{10,}/gi, "Bearer [REDACTED]"],
	[/("password"\s*:\s*)"[^"]+"/gi, '$1"[REDACTED]"'],
	[/("token"\s*:\s*)"[^"]+"/gi, '$1"[REDACTED]"'],
	[/("authorization"\s*:\s*)"[^"]+"/gi, '$1"[REDACTED]"'],
];

export function redactSecrets(input: string): string {
	let out = input;
	for (const [pattern, replacement] of SECRET_PATTERNS) {
		out = out.replace(pattern, replacement);
	}
	return out;
}

export function truncateStack(stack: string, maxLines = 8): string {
	const lines = stack.split("\n");
	if (lines.length <= maxLines) return stack;
	return [
		...lines.slice(0, maxLines),
		`    ... (${lines.length - maxLines} more frames truncated)`,
	].join("\n");
}

export function formatImplError(args: { skillKey: string; err: unknown }): ToolResult {
	const { skillKey, err } = args;

	const message = err instanceof Error ? err.message : String(err);
	const rawStack = err instanceof Error && err.stack ? err.stack : "";
	const stack = rawStack ? truncateStack(redactSecrets(rawStack)) : "";

	const redactedMessage = redactSecrets(message);
	const text = stack
		? `Error invoking skill '${skillKey}': ${redactedMessage}\n${stack}`
		: `Error invoking skill '${skillKey}': ${redactedMessage}`;

	return {
		isError: true,
		content: [{ type: "text", text }],
	};
}

export function formatUnknownSkill(skillKey: string): ToolResult {
	return {
		isError: true,
		content: [
			{
				type: "text",
				text: `Unknown tool: ${skillKey}. No implementation registered.`,
			},
		],
	};
}

export function formatSuccess(value: unknown): ToolResult {
	let text: string;
	if (typeof value === "string") {
		text = value;
	} else {
		try {
			text = JSON.stringify(value);
		} catch {
			text = String(value);
		}
	}
	return {
		isError: false,
		content: [{ type: "text", text }],
	};
}
