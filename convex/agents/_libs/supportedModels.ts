/**
 * UX-facing catalog of models the owner can pick in /agents/[id]/edit.
 * Kept in sync with `MODEL_PRICES` (convex/cost/_libs/modelPrices) so an
 * unpriced model never slips into the dropdown — if they drift, the cost
 * ledger zero-prices every row for the affected model. A unit test
 * enforces the invariant.
 */

export type SupportedModel = {
	modelId: string;
	provider: "anthropic";
	label: string;
};

export const SUPPORTED_MODELS: ReadonlyArray<SupportedModel> = [
	{ modelId: "claude-opus-4-7", provider: "anthropic", label: "Claude Opus 4.7" },
	{ modelId: "claude-opus-4-6", provider: "anthropic", label: "Claude Opus 4.6" },
	{ modelId: "claude-sonnet-4-6", provider: "anthropic", label: "Claude Sonnet 4.6" },
	{ modelId: "claude-sonnet-4-5", provider: "anthropic", label: "Claude Sonnet 4.5" },
	{ modelId: "claude-haiku-4-5", provider: "anthropic", label: "Claude Haiku 4.5" },
];

export function isSupportedModel(modelId: string): boolean {
	return SUPPORTED_MODELS.some((m) => m.modelId === modelId);
}
