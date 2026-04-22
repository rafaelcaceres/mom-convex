import { z } from "zod";
import type { MutationCtx } from "../_generated/server";
import { zodToJsonSchemaString } from "./_libs/zodSerialize";
import { SkillCatalogRepository } from "./adapters/skillCatalog.repository";
import type { NewSkillCatalog, SkillCatalogAgg } from "./domain/skill.model";

/**
 * Built-in skills registry. Keys are the stable public identifiers referenced
 * by `agentSkills` bindings (M2-T03) and the tool-call names exposed to the
 * model. Implementations land in later tasks — this entry set is seeded so
 * the catalog table has rows the dashboard and resolver can read.
 *
 *   http.fetch        → M2-T06
 *   memory.search     → M2-T08
 *   sandbox.bash/...  → M2-T12
 *
 * Add here when introducing a new built-in. Third-party / user-authored
 * skills will get a separate table (not in scope for this milestone).
 */

const httpFetchArgs = z.object({
	url: z.string().url(),
	method: z.enum(["GET", "POST"]).optional(),
	headers: z.record(z.string(), z.string()).optional(),
	body: z.string().optional(),
});

const memorySearchArgs = z.object({
	query: z.string(),
	scope: z.enum(["memory", "history", "all"]).optional(),
	limit: z.number().int().positive().max(50).optional(),
});

const sandboxBashArgs = z.object({
	command: z.string(),
	timeoutMs: z.number().int().positive().max(60_000).optional(),
});

const sandboxReadArgs = z.object({
	path: z.string(),
});

const sandboxWriteArgs = z.object({
	path: z.string(),
	content: z.string(),
});

const sandboxBrowseArgs = z.object({
	url: z.string(),
});

export const BUILT_IN_SKILLS: readonly NewSkillCatalog[] = [
	{
		key: "http.fetch",
		name: "HTTP Fetch",
		description:
			"Fetch an HTTP(S) resource. 10s timeout, 50KB response cap, SSRF-guarded (blocks private / loopback hosts).",
		zodSchemaJson: zodToJsonSchemaString(httpFetchArgs),
		sideEffect: "read",
		enabled: true,
	},
	{
		key: "memory.search",
		name: "Memory Search",
		description: "Semantic search over the org's long-lived memory.",
		zodSchemaJson: zodToJsonSchemaString(memorySearchArgs),
		sideEffect: "read",
		enabled: true,
	},
	{
		key: "sandbox.bash",
		name: "Sandbox Bash",
		description: "Run a shell command inside the org's Vercel Sandbox.",
		zodSchemaJson: zodToJsonSchemaString(sandboxBashArgs),
		sideEffect: "write",
		enabled: true,
	},
	{
		key: "sandbox.read",
		name: "Sandbox Read",
		description: "Read a file from the org's Vercel Sandbox.",
		zodSchemaJson: zodToJsonSchemaString(sandboxReadArgs),
		sideEffect: "read",
		enabled: true,
	},
	{
		key: "sandbox.write",
		name: "Sandbox Write",
		description: "Write a file inside the org's Vercel Sandbox.",
		zodSchemaJson: zodToJsonSchemaString(sandboxWriteArgs),
		sideEffect: "write",
		enabled: true,
	},
	{
		key: "sandbox.browse",
		name: "Sandbox Browse",
		description: "Fetch a URL from inside the sandbox (follows redirects).",
		zodSchemaJson: zodToJsonSchemaString(sandboxBrowseArgs),
		sideEffect: "read",
		enabled: true,
	},
] as const;

/**
 * Idempotent catalog seed. Inserts any missing built-in, leaves existing
 * rows untouched. Safe to re-run after adding a new `BUILT_IN_SKILLS` entry.
 */
export async function seedSkillCatalog(ctx: MutationCtx): Promise<SkillCatalogAgg[]> {
	const results: SkillCatalogAgg[] = [];
	for (const skill of BUILT_IN_SKILLS) {
		const existing = await SkillCatalogRepository.getByKey(ctx, { key: skill.key });
		if (existing) {
			results.push(existing);
			continue;
		}
		const created = await SkillCatalogRepository.create(ctx, skill);
		results.push(created);
	}
	return results;
}
