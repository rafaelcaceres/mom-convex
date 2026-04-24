"use node";

import { z } from "zod";
import { getSandboxForScope } from "../../sandbox/_libs/sandboxAccess";
import { type SkillImpl, registerSkill } from "../_libs/skillImpls";

/**
 * `sandbox.bash` — run a shell command inside the thread's Vercel sandbox.
 *
 * Structured result `{stdout, stderr, exitCode}` gets handed back to the
 * model as the tool call output; the model chooses how to react to
 * non-zero exits instead of us throwing and losing the diagnostic.
 *
 * Dangerous patterns (`rm -rf /`, `curl | sh`, etc.) are gated *upstream*
 * by the dispatcher's confirmation heuristic (M2-T05) — by the time this
 * impl runs, the command has already been approved (future M3-T11) or
 * matched the benign path.
 *
 * The 60s ceiling matches `sandboxBashArgs.timeoutMs.max` in
 * `convex/skills/_seeds.ts` — keeping schema + impl defaults in sync so
 * the model's options match what actually runs.
 */

const DEFAULT_TIMEOUT_MS = 60_000;

const SandboxBashArgs = z.object({
	command: z.string().min(1),
	timeoutMs: z.number().int().positive().max(60_000).optional(),
});

export type SandboxBashResult = {
	stdout: string;
	stderr: string;
	exitCode: number;
};

export const sandboxBashImpl: SkillImpl = async (ctx, input, options) => {
	const args = SandboxBashArgs.parse(input);
	const { client, sandboxId } = await getSandboxForScope(ctx, options.scope);
	const result = await client.exec(sandboxId, {
		command: args.command,
		timeoutMs: args.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		signal: options.signal,
	});
	return result satisfies SandboxBashResult;
};

registerSkill("sandbox.bash", sandboxBashImpl);
