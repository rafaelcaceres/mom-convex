"use node";

import { z } from "zod";
import { type SkillImpl, registerSkill } from "../_libs/skillImpls";

/**
 * `sandbox.browse` — deliberately stubbed in M2.
 *
 * The real version will use a headless Chromium inside the sandbox
 * (Playwright pre-installed via snapshot) to fetch + render a URL,
 * returning DOM / screenshot / console. That infrastructure lands in M3
 * so M2 doesn't pay the snapshot build cost.
 *
 * Explicit gate instead of a silent failure: the model sees a structured
 * `{note, availableIn}` response and adjusts its plan instead of
 * retrying the call or staying confused about why no content came back.
 */

const SandboxBrowseArgs = z.object({
	url: z.string().url(),
});

export type SandboxBrowseResult = {
	note: string;
	availableIn: string;
};

export const sandboxBrowseImpl: SkillImpl = async (_ctx, input) => {
	SandboxBrowseArgs.parse(input);
	return {
		note: "sandbox.browse is not implemented yet — use http.fetch for plain HTTP(S) GETs in the meantime.",
		availableIn: "M3 (headless Chromium inside the sandbox)",
	} satisfies SandboxBrowseResult;
};

registerSkill("sandbox.browse", sandboxBrowseImpl);
