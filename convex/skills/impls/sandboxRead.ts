"use node";

import { z } from "zod";
import { getSandboxForScope } from "../../sandbox/_libs/sandboxAccess";
import { type SkillImpl, registerSkill } from "../_libs/skillImpls";

/**
 * `sandbox.read` — read a text file from the thread's sandbox.
 *
 * Path guard: reject anything not under the workspace root
 * (`/vercel/sandbox/...`) or `/tmp/...`, and any `..` traversal. The
 * Vercel sandbox is already isolated, so this is defense-in-depth —
 * narrows the surface the model can poke at (e.g. reading `/etc/shadow`
 * inside the VM, which leaks nothing interesting but invites noise).
 * Relative paths fall through to the sandbox SDK default cwd
 * (`/vercel/sandbox`).
 *
 * Returns `null` (surfaced to the model) when the file doesn't exist —
 * cheaper than a thrown error and lets the model adjust without a retry.
 */

const WORKSPACE_PREFIXES = ["/vercel/sandbox/", "/tmp/"] as const;

const SandboxReadArgs = z.object({
	path: z.string().min(1),
});

export type SandboxReadResult = {
	content: string | null;
};

function assertSafePath(path: string): void {
	if (path.includes("..")) {
		throw new Error(`sandbox.read refuses path traversal: ${path}`);
	}
	if (path.startsWith("/")) {
		const ok = WORKSPACE_PREFIXES.some((p) => path.startsWith(p));
		if (!ok) {
			throw new Error(
				`sandbox.read only serves absolute paths under /vercel/sandbox/ or /tmp/ (got: ${path})`,
			);
		}
	}
}

export const sandboxReadImpl: SkillImpl = async (ctx, input, options) => {
	const args = SandboxReadArgs.parse(input);
	assertSafePath(args.path);
	const { client, sandboxId } = await getSandboxForScope(ctx, options.scope);
	const content = await client.readFile(sandboxId, args.path);
	return { content } satisfies SandboxReadResult;
};

registerSkill("sandbox.read", sandboxReadImpl);
