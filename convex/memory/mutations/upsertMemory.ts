import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { AgentRepository } from "../../agents/adapters/agent.repository";
import { requireOrgRole } from "../../auth.utils";
import { mutation } from "../../customFunctions";
import { ThreadRepository } from "../../threads/adapters/thread.repository";
import { MemoryRepository } from "../adapters/memory.repository";
import { MAX_MEMORY_CONTENT_CHARS, MemoryScopeModel } from "../domain/memory.model";

/**
 * Upsert a memory row. `id` present → patch the existing row; absent → create.
 *
 * Authz is graded by scope:
 *  - `org` and `agent` scopes shape the agent's long-term behavior for every
 *    user in the tenant, so they require an `admin` role (or higher).
 *  - `thread` scope only affects a single conversation, so any `member` can
 *    write one (think: user asks the bot to "remember my preferred units").
 *
 * Invariants enforced here (the schema permits optional fields on every
 * scope, so we reject impossible combos explicitly to keep the read path
 * simple):
 *  - `scope: "org"`    → `agentId` / `threadId` must be absent.
 *  - `scope: "agent"`  → `agentId` present, `threadId` absent; agent must
 *    belong to `orgId`.
 *  - `scope: "thread"` → `agentId` + `threadId` present, both must belong to
 *    `orgId`, and `threadId.agentId` must match `agentId`.
 *
 * On update, scope + orgId are locked — changing them would quietly move the
 * row under a different authz boundary. Callers delete + re-create instead.
 */
const upsertMemory = mutation({
	args: {
		id: v.optional(v.id("memory")),
		orgId: v.string(),
		scope: MemoryScopeModel,
		agentId: v.optional(v.id("agents")),
		threadId: v.optional(v.id("threads")),
		content: v.string(),
		alwaysOn: v.optional(v.boolean()),
	},
	returns: v.id("memory"),
	handler: async (ctx, args): Promise<Id<"memory">> => {
		const content = args.content.trim();
		if (content.length === 0) throw new Error("content cannot be empty");
		if (content.length > MAX_MEMORY_CONTENT_CHARS) {
			throw new Error(`content exceeds ${MAX_MEMORY_CONTENT_CHARS} chars`);
		}

		const minRole = args.scope === "thread" ? "member" : "admin";
		await requireOrgRole(ctx, args.orgId, minRole);

		// requireOrgRole returns userId as an opaque string; re-derive it as a
		// typed Id<"users"> for storage (updatedBy is validator-typed).
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error("Authentication required");

		if (args.scope === "org") {
			if (args.agentId || args.threadId) {
				throw new Error("org-scoped memory must not set agentId or threadId");
			}
		} else if (args.scope === "agent") {
			if (!args.agentId) throw new Error("agent-scoped memory requires agentId");
			if (args.threadId) throw new Error("agent-scoped memory must not set threadId");
			const agent = await AgentRepository.get(ctx, args.agentId);
			if (!agent || agent.getModel().orgId !== args.orgId) {
				throw new Error("Agent not found in org");
			}
		} else {
			if (!args.agentId) throw new Error("thread-scoped memory requires agentId");
			if (!args.threadId) throw new Error("thread-scoped memory requires threadId");
			const thread = await ThreadRepository.get(ctx, args.threadId);
			if (!thread) throw new Error("Thread not found");
			const t = thread.getModel();
			if (t.orgId !== args.orgId) throw new Error("Thread does not belong to org");
			if (t.agentId !== args.agentId) throw new Error("Thread does not belong to agent");
		}

		const now = Date.now();
		const alwaysOn = args.alwaysOn ?? false;

		if (args.id) {
			const existing = await MemoryRepository.get(ctx, args.id);
			if (!existing) throw new Error("Memory not found");
			const prev = existing.getModel();
			if (prev.orgId !== args.orgId) throw new Error("Memory does not belong to org");
			if (prev.scope !== args.scope) {
				throw new Error("Cannot change scope on an existing memory; delete and re-create");
			}
			existing.updateContent(args.content);
			existing.setAlwaysOn(alwaysOn);
			existing.touch(userId, now);
			await MemoryRepository.save(ctx, existing);
			return prev._id;
		}

		const agg = await MemoryRepository.create(ctx, {
			orgId: args.orgId,
			scope: args.scope,
			agentId: args.agentId,
			threadId: args.threadId,
			content,
			alwaysOn,
			updatedBy: userId,
			updatedAt: now,
		});
		return agg.getModel()._id;
	},
});

export default upsertMemory;
