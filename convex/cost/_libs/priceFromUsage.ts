import { MODEL_PRICES } from "./modelPrices";

/**
 * Minimal subset of AI SDK v6's `LanguageModelUsage` shape. We avoid
 * importing `LanguageModelUsage` directly so this lib stays usable in
 * V8 mutations (AI SDK pulls Node-only deps on some code paths).
 *
 * Every numeric field is optional — providers may omit cache details
 * when no cache was touched, and some tool-only steps return zero
 * usage entirely.
 */
export type UsageShape = {
	inputTokens?: number;
	outputTokens?: number;
	inputTokenDetails?: {
		noCacheTokens?: number;
		cacheReadTokens?: number;
		cacheWriteTokens?: number;
	};
};

export type PriceBreakdown = {
	tokensIn: number;
	tokensOut: number;
	cacheRead: number;
	cacheWrite: number;
	costUsd: number;
};

/**
 * Convert a step's usage object + model id into a ledger-ready price
 * breakdown. Anthropic counts cache reads/writes inside `inputTokens`,
 * so we price the non-cached slice at full input rate and charge the
 * cache slices at their own columns (`cacheReadPerM`/`cacheWritePerM`).
 *
 * Unknown model → `costUsd = 0` with a warn log. Tokens are still
 * returned so the ledger records usage; the dashboard can flag unpriced
 * rows by `costUsd === 0 && tokensIn > 0`.
 */
export function priceFromUsage(args: { model: string; usage: UsageShape }): PriceBreakdown {
	const tokensIn = args.usage.inputTokens ?? 0;
	const tokensOut = args.usage.outputTokens ?? 0;
	const cacheRead = args.usage.inputTokenDetails?.cacheReadTokens ?? 0;
	const cacheWrite = args.usage.inputTokenDetails?.cacheWriteTokens ?? 0;

	const price = MODEL_PRICES[args.model];
	if (!price) {
		console.warn(`[cost] priceFromUsage: unknown model '${args.model}' — costUsd=0`);
		return { tokensIn, tokensOut, cacheRead, cacheWrite, costUsd: 0 };
	}

	const explicitNonCache = args.usage.inputTokenDetails?.noCacheTokens;
	const nonCache = explicitNonCache ?? Math.max(0, tokensIn - cacheRead - cacheWrite);

	const costUsd =
		(nonCache * price.inputPerM +
			tokensOut * price.outputPerM +
			cacheRead * price.cacheReadPerM +
			cacheWrite * price.cacheWritePerM) /
		1_000_000;

	return { tokensIn, tokensOut, cacheRead, cacheWrite, costUsd };
}
