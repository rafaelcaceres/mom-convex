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

/**
 * Hashed bag-of-words embedding — the model to use when a test asserts on
 * *retrieval*, not on plumbing.
 *
 * `fakeEmbeddingFor` above is a hash of the whole string: identical texts land
 * on identical vectors, and everything else is unrelated noise. That is all a
 * trigger test needs ("this row got a vector, and it's this row's vector"), but
 * it makes semantic search untestable — the only query that can retrieve a
 * memory is its exact content, so ranking, thresholds, and near-misses can't be
 * exercised at all.
 *
 * Here each *word* gets an axis, so cosine similarity is word overlap: a query
 * shares a term with a memory ⇒ score > 0, shares none ⇒ score is exactly 0.
 * Crude next to a real embedding model — no synonyms, no semantics — but it has
 * the one property `MIN_SCORE` is tuned against (related > threshold >
 * unrelated), which is what the assertions actually rest on.
 */
export function bagOfWordsEmbedding(text: string): number[] {
	const vec = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
	for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
		let axis = 0;
		for (let i = 0; i < word.length; i++) {
			axis = (axis * 31 + word.charCodeAt(i)) % EMBEDDING_DIMENSIONS;
		}
		vec[axis] = (vec[axis] ?? 0) + 1;
	}
	const norm = Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0));
	// Text with no word characters at all yields the zero vector; cosine against
	// it is 0, which is the honest answer ("matches nothing"), not a crash.
	return norm === 0 ? vec : vec.map((x) => x / norm);
}

export function bagOfWordsEmbeddingModel(): MockEmbeddingModelV3 {
	return new MockEmbeddingModelV3({
		doEmbed: async ({ values }) => ({
			embeddings: values.map((v) => bagOfWordsEmbedding(v)),
			warnings: [],
		}),
	});
}
