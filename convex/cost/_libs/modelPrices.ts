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
};
