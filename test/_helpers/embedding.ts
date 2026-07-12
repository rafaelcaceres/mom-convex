import { MockEmbeddingModelV3 } from "ai/test";
import { EMBEDDING_DIMENSIONS } from "../../convex/memory/_libs/embedding";

/**
 * Deterministic stand-in for the OpenAI embedding model.
 *
 * Installed globally in `test/setup.ts`, because the `memory` trigger (M3-T02)
 * schedules an embed on *every* content write. Without a default override, any
 * suite that touches `memory` and drains the scheduler would fail on a missing
 * `OPENAI_EMBEDDING_KEY` — turning an unrelated test into a landmine. Suites
 * that want to assert on embedding behaviour specifically can still call
 * `_setEmbeddingModelOverride` with their own model.
 *
 * Vectors are derived from the input text (not constant) so that two different
 * memories don't collide — M3-T04's semantic search will need distinguishable
 * vectors to assert ranking against.
 *
 * `warnings: []` is mandatory, not decorative: AI SDK v6's `embedMany` spreads
 * `result.warnings`, so a mock omitting it throws "result.warnings is not
 * iterable" from inside a scheduled function, where it reads as a trigger bug.
 */
export function fakeEmbeddingFor(text: string): number[] {
	let seed = 0;
	for (let i = 0; i < text.length; i++) {
		seed = (seed * 31 + text.charCodeAt(i)) % 100_000;
	}
	return Array.from(
		{ length: EMBEDDING_DIMENSIONS },
		(_, i) => Math.sin(seed + i) * 0.5, // bounded, deterministic, content-dependent
	);
}

export function mockEmbeddingModel(): MockEmbeddingModelV3 {
	return new MockEmbeddingModelV3({
		doEmbed: async ({ values }) => ({
			embeddings: values.map((v) => fakeEmbeddingFor(v)),
			warnings: [],
		}),
	});
}
