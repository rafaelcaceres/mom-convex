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

const memorySaveArgs = z.object({
	content: z.string().min(1).max(8000),
	// Omitted ⇒ the impl files the memory under the current channel (Slack), or
	// the current thread when the platform has no channel (web chat). The model
	// is not asked to know which, because it can't: the binding lives on the
	// thread row, not in the conversation.
	scope: z.enum(["channel", "thread"]).optional(),
	alwaysOn: z.boolean().optional(),
});

const eventCreateArgs = z
	.object({
		text: z.string().min(1).max(2000),
		at: z.string().datetime().optional(),
		afterMinutes: z
			.number()
			.positive()
			.max(60 * 24 * 366)
			.optional(),
		cron: z.string().optional(),
	})
	// The exactly-one rule is not representable in JSON Schema (the model sees
	// three optionals); the tool description carries it and the impl enforces it.
	.refine((a) => [a.at, a.afterMinutes, a.cron].filter((x) => x !== undefined).length === 1, {
		message: "provide exactly one of `at`, `afterMinutes`, or `cron`",
	});

const eventListArgs = z.object({}).strict();

const eventCancelArgs = z.object({
	eventId: z.string().min(1),
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
		key: "memory.save",
		name: "Memory Save",
		description:
			"Remember a durable fact. Defaults to the current Slack channel (shared by every thread in that channel) — or the current conversation when there is no channel. Use for facts worth recalling in a later conversation, not for chit-chat.",
		zodSchemaJson: zodToJsonSchemaString(memorySaveArgs),
		// It genuinely writes — the audit trail should say so — but it writes a
		// reversible row in our own DB, scoped to a room the user is already in.
		// Nothing like `sandbox.bash`, so it opts out of human confirmation.
		sideEffect: "write",
		requiresConfirmation: false,
		enabled: true,
	},
	{
		key: "event.create",
		name: "Schedule Event",
		description:
			"Schedule yourself to act later, in THIS conversation: a reminder, a follow-up, a recurring check. Provide exactly ONE of: `afterMinutes` (relative — prefer this for 'in an hour' style asks), `at` (ISO 8601 UTC, e.g. 2026-07-14T09:00:00Z), or `cron` (5-field, UTC) for recurring. All times are UTC. `text` is the instruction your future self will receive.",
		zodSchemaJson: zodToJsonSchemaString(eventCreateArgs),
		// Writes a reversible, tenant-scoped row that `event.cancel` (or the
		// dashboard) can withdraw — but each fire spends a real agent turn, so if
		// runaway crons show up in the cost ledger, this is the flag to flip.
		sideEffect: "write",
		requiresConfirmation: false,
		enabled: true,
	},
	{
		key: "event.list",
		name: "List Scheduled Events",
		description:
			"List your scheduled events (reminders, recurring checks) with their status and next run time. Use before cancelling, to find the eventId.",
		zodSchemaJson: zodToJsonSchemaString(eventListArgs),
		sideEffect: "read",
		enabled: true,
	},
	{
		key: "event.cancel",
		name: "Cancel Scheduled Event",
		description:
			"Cancel one of your scheduled events by eventId (get it from event.list). Idempotent; a reminder that already fired reports status 'done'.",
		zodSchemaJson: zodToJsonSchemaString(eventCancelArgs),
		sideEffect: "write",
		requiresConfirmation: false,
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
