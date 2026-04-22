import { v } from "convex/values";
import { requireOrgRole } from "../../auth.utils";
import { mutation } from "../../customFunctions";
import { MemoryRepository } from "../adapters/memory.repository";

/**
 * Delete a memory row. Authz mirrors `upsertMemory`: `thread`-scoped rows can
 * be deleted by any `member`, `org` / `agent` scopes require `admin`.
 */
const deleteMemory = mutation({
	args: { id: v.id("memory") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const existing = await MemoryRepository.get(ctx, args.id);
		if (!existing) throw new Error("Memory not found");
		const doc = existing.getModel();

		const minRole = doc.scope === "thread" ? "member" : "admin";
		await requireOrgRole(ctx, doc.orgId, minRole);

		await MemoryRepository.delete(ctx, args.id);
		return null;
	},
});

export default deleteMemory;
