/**
 * Model prices per 1,000,000 tokens in USD. Sourced from Anthropic's
 * public pricing page (https://www.anthropic.com/pricing) as of
 * 2026-04-24. Values are config, not truth — revisit when pricing
 * changes. Unknown model IDs fall through to `costUsd = 0`; see
 * `priceFromUsage`.
 *
 * Cache write premium uses the "5m TTL" tier; the "1h TTL" tier is a
 * different column on Anthropic's table but we don't surface that knob
 * to callers yet — `@convex-dev/agent` doesn't expose which TTL was
 * used per step. Good enough for M2 ledger; refine if cache-heavy
 * workloads skew the numbers.
 */

export type ModelPrice = {
	inputPerM: number;
	outputPerM: number;
	cacheReadPerM: number;
	cacheWritePerM: number;
};

export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
	"claude-opus-4-7": {
		inputPerM: 15,
		outputPerM: 75,
		cacheReadPerM: 1.5,
		cacheWritePerM: 18.75,
	},
	"claude-opus-4-6": {
		inputPerM: 15,
		outputPerM: 75,
		cacheReadPerM: 1.5,
		cacheWritePerM: 18.75,
	},
	"claude-sonnet-4-6": {
		inputPerM: 3,
		outputPerM: 15,
		cacheReadPerM: 0.3,
		cacheWritePerM: 3.75,
	},
	"claude-sonnet-4-5": {
		inputPerM: 3,
		outputPerM: 15,
		cacheReadPerM: 0.3,
		cacheWritePerM: 3.75,
	},
	"claude-haiku-4-5": {
		inputPerM: 1,
		outputPerM: 5,
		cacheReadPerM: 0.1,
		cacheWritePerM: 1.25,
	},
	// Gemini 2.5 — context cache is implicit and pricing is roughly 25% of
	// input on the standard tier; we approximate cacheReadPerM = 0.25× input
	// and leave cacheWritePerM = inputPerM (no surcharge), so a thinking
	// turn with cache hits prices conservatively-low rather than zero.
	// See https://ai.google.dev/gemini-api/docs/pricing.
	"gemini-2.5-pro": {
		inputPerM: 1.25,
		outputPerM: 10,
		cacheReadPerM: 0.31,
		cacheWritePerM: 1.25,
	},
	"gemini-2.5-flash": {
		inputPerM: 0.3,
		outputPerM: 2.5,
		cacheReadPerM: 0.075,
		cacheWritePerM: 0.3,
	},
	// DeepSeek pricing (https://api-docs.deepseek.com/quick_start/pricing).
	// Public list pricing in USD; cache hit ≈ 25% of cache miss. No
	// surcharge to write to cache, so cacheWritePerM = inputPerM (matches
	// the gemini convention above — keeps cache-heavy workloads from
	// pricing to zero, but doesn't overcount). Output for `deepseek-reasoner`
	// includes reasoning tokens at the same rate.
	"deepseek-chat": {
		inputPerM: 0.27,
		outputPerM: 1.1,
		cacheReadPerM: 0.07,
		cacheWritePerM: 0.27,
	},
	"deepseek-reasoner": {
		inputPerM: 0.55,
		outputPerM: 2.19,
		cacheReadPerM: 0.14,
		cacheWritePerM: 0.55,
	},
};
