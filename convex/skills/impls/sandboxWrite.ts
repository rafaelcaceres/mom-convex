"use node";

import { z } from "zod";
import { getSandboxForScope } from "../../sandbox/_libs/sandboxAccess";
import { type SkillImpl, registerSkill } from "../_libs/skillImpls";

/**
 * `sandbox.write` — create or overwrite a text file inside the sandbox.
 *
 * Catalog `sideEffect: "write"`, so the invoke dispatcher gates this
 * behind the confirmation contract (M2-T05 today, real human-in-loop
 * wiring in M3-T11). Same path guard as `sandbox.read` — restricted to
 * the workspace root / `/tmp/`, no `..` traversal.
 *
 * Vercel's `writeFiles` overwrites by default; we don't expose an
 * "append" mode — if the model needs that, it can read → concat → write,
 * which is traceable through the tool log.
 */

const WORKSPACE_PREFIXES = ["/vercel/sandbox/", "/tmp/"] as const;
const MAX_CONTENT_BYTES = 1_000_000;

const SandboxWriteArgs = z.object({
	path: z.string().min(1),
	content: z.string(),
});

export type SandboxWriteResult = {
	path: string;
	bytesWritten: number;
};

function assertSafePath(path: string): void {
	if (path.includes("..")) {
		throw new Error(`sandbox.write refuses path traversal: ${path}`);
	}
	if (path.startsWith("/")) {
		const ok = WORKSPACE_PREFIXES.some((p) => path.startsWith(p));
		if (!ok) {
			throw new Error(
				`sandbox.write only serves absolute paths under /vercel/sandbox/ or /tmp/ (got: ${path})`,
			);
		}
	}
}

export const sandboxWriteImpl: SkillImpl = async (ctx, input, options) => {
	const args = SandboxWriteArgs.parse(input);
	assertSafePath(args.path);
	const bytes = Buffer.byteLength(args.content, "utf8");
	if (bytes > MAX_CONTENT_BYTES) {
		throw new Error(
			`sandbox.write content exceeds ${MAX_CONTENT_BYTES} bytes (got ${bytes}). Split across files or trim.`,
		);
	}
	const { client, sandboxId } = await getSandboxForScope(ctx, options.scope);
	await client.writeFile(sandboxId, args.path, args.content);
	return { path: args.path, bytesWritten: bytes } satisfies SandboxWriteResult;
};

registerSkill("sandbox.write", sandboxWriteImpl);
