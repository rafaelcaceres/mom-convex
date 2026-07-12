import { v } from "convex/values";
import { internalMutation } from "../../customFunctions";
import { EMBEDDING_DIMENSIONS } from "../_libs/embedding";
import { MemoryRepository } from "../adapters/memory.repository";

/**
 * Compare-and-set write-back for a memory's vector. Called only by
 * `internal.memory.actions.embed` (M3-T02).
 *
 * The `content` argument is the text that was actually embedded, and it is
 * checked against the row before the vector lands. This is what makes
 * concurrent edits safe:
 *
 *   t0  user saves "A"        → trigger schedules embed(id, "A")
 *   t1  user saves "B"        → trigger schedules embed(id, "B")
 *   t2  embed("A") finishes   → row.content is "B" ≠ "A" → *rejected*
 *   t3  embed("B") finishes   → row.content is "B" → written
 *
 * Without the check, whichever call finished last would win, and a stale
 * vector silently attached to fresh content is the worst kind of RAG bug: the
 * row is *findable*, just by the wrong query. Returning `false` (rather than
 * throwing) keeps a superseded call from looking like an incident — it did
 * nothing wrong, it just lost the race.
 *
 * The dimension assert guards the vector index: Convex fixes dimensionality at
 * index-definition time, so a model swap that changes output size would
 * otherwise fail deep in the write path with an opaque error.
 */
const setEmbeddingInternal = internalMutation({
	args: {
		memoryId: v.id("memory"),
		content: v.string(),
		embedding: v.array(v.number()),
	},
	returns: v.boolean(),
	handler: async (ctx, args): Promise<boolean> => {
		if (args.embedding.length !== EMBEDDING_DIMENSIONS) {
			throw new Error(
				`embedding has ${args.embedding.length} dimensions, expected ${EMBEDDING_DIMENSIONS} — the vector index in convex/memory/_tables.ts is fixed at that size`,
			);
		}

		const existing = await MemoryRepository.get(ctx, args.memoryId);
		// Deleted while the embedding call was in flight. Nothing to attach to.
		if (!existing) return false;

		// Superseded by a newer edit; that edit scheduled its own embed.
		if (existing.getModel().content !== args.content) return false;

		existing.setEmbedding(args.embedding);
		await MemoryRepository.save(ctx, existing);
		return true;
	},
});

export default setEmbeddingInternal;
