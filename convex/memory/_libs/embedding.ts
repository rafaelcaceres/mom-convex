import { createOpenAI } from "@ai-sdk/openai";
import type { EmbeddingModelV3 } from "@ai-sdk/provider";

/**
 * Embedding model used to vectorize `memory.content`.
 *
 * `text-embedding-3-small` emits 1536 dimensions, which is exactly what the
 * `by_embedding` vector index declares in `convex/memory/_tables.ts`. The two
 * numbers are load-bearing on each other: Convex fixes a vector index's
 * dimensionality at definition time, so swapping to a model with a different
 * output size is a schema migration (re-declare the index, re-embed every
 * row), not a one-line constant change. `EMBEDDING_DIMENSIONS` is asserted on
 * the write path (`setEmbeddingInternal`) so a mismatch surfaces as a clear
 * error instead of a Convex-level index rejection.
 *
 * The key is read lazily, per call, rather than at module scope: this module
 * is imported by the trigger path (V8 runtime, no key needed) and only the
 * action actually embeds. Reading it at import time would make every mutation
 * that touches `memory` fail on a deployment without the key set.
 *
 * `OPENAI_EMBEDDING_KEY` is deliberately separate from the chat model's
 * credentials (Anthropic) — embeddings are a different provider and a
 * different billing line, and we don't want one key's rotation to take down
 * both paths. It falls back to `OPENAI_API_KEY` so a deployment that already
 * holds an OpenAI credential doesn't have to store the same secret twice.
 */

export const EMBEDDING_MODEL_ID = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

let testModelOverride: EmbeddingModelV3 | null = null;

export function resolveEmbeddingModel(): EmbeddingModelV3 {
	if (testModelOverride) return testModelOverride;

	// A dedicated key wins when present, so embeddings can be billed and rotated
	// independently of anything else we call OpenAI for. Falling back to the
	// general key means a deployment that already talks to OpenAI doesn't have to
	// store the same secret twice just to turn memory on.
	const apiKey = process.env.OPENAI_EMBEDDING_KEY ?? process.env.OPENAI_API_KEY;
	if (!apiKey) {
		throw new Error(
			"Neither OPENAI_EMBEDDING_KEY nor OPENAI_API_KEY is set — memory embeddings cannot be generated. " +
				"Set one with `pnpm exec convex env set OPENAI_EMBEDDING_KEY sk-...`.",
		);
	}

	return createOpenAI({ apiKey }).textEmbeddingModel(EMBEDDING_MODEL_ID);
}

/**
 * Test hook: force `resolveEmbeddingModel` to return the supplied model,
 * bypassing both the provider construction and the env-var check. Pass `null`
 * to restore real resolution.
 */
export function _setEmbeddingModelOverride(model: EmbeddingModelV3 | null): void {
	testModelOverride = model;
}
