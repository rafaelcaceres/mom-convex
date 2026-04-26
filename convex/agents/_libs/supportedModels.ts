/**
 * UX-facing catalog of models the owner can pick in /agents/[id]/edit.
 * Kept in sync with `MODEL_PRICES` (convex/cost/_libs/modelPrices) so an
 * unpriced model never slips into the dropdown — if they drift, the cost
 * ledger zero-prices every row for the affected model. A unit test
 * enforces the invariant.
 */

export type ModelProvider = "anthropic" | "google" | "deepseek";

export type SupportedModel = {
	modelId: string;
	provider: ModelProvider;
	label: string;
};

export const SUPPORTED_MODELS: ReadonlyArray<SupportedModel> = [
	{ modelId: "claude-opus-4-7", provider: "anthropic", label: "Claude Opus 4.7" },
	{ modelId: "claude-opus-4-6", provider: "anthropic", label: "Claude Opus 4.6" },
	{ modelId: "claude-sonnet-4-6", provider: "anthropic", label: "Claude Sonnet 4.6" },
	{ modelId: "claude-sonnet-4-5", provider: "anthropic", label: "Claude Sonnet 4.5" },
	{ modelId: "claude-haiku-4-5", provider: "anthropic", label: "Claude Haiku 4.5" },
	// Gemini 2.5 has native extended thinking — used to exercise the F-03
	// reasoning-on-thread-reply path. `thinkingConfig.includeThoughts` is
	// turned on per-turn in handleIncoming based on `provider === "google"`.
	{ modelId: "gemini-2.5-pro", provider: "google", label: "Gemini 2.5 Pro" },
	{ modelId: "gemini-2.5-flash", provider: "google", label: "Gemini 2.5 Flash" },
	// DeepSeek: `deepseek-chat` is V3 (general), `deepseek-reasoner` is R1
	// (emits reasoning natively — the AI SDK extracts it into the reasoning
	// channel without needing providerOptions, unlike Gemini).
	{ modelId: "deepseek-chat", provider: "deepseek", label: "DeepSeek V3" },
	{ modelId: "deepseek-reasoner", provider: "deepseek", label: "DeepSeek R1" },
];

export function isSupportedModel(modelId: string): boolean {
	return SUPPORTED_MODELS.some((m) => m.modelId === modelId);
}
