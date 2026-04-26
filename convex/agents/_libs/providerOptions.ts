/**
 * Structural alias for the AI SDK's `ProviderOptions` shape. Declared
 * locally instead of imported from `@ai-sdk/provider-utils` so we don't
 * pin a transitive dep in `dependencies`.
 */
export type ProviderOptions = Record<string, Record<string, unknown>>;

/**
 * Per-provider knobs we want flipped on every turn. Today this just
 * enables Gemini's reasoning emission so the F-03 reasoning-on-thread-reply
 * path actually has text to show — the AI SDK wraps these into the
 * provider-specific `providerOptions` slot at request time.
 *
 * Anthropic extended thinking is intentionally NOT enabled here: it
 * costs extra output tokens and changes latency, so it should land
 * behind a per-agent toggle (future task) rather than a global default.
 */
export function buildProviderOptions(provider: string): ProviderOptions | undefined {
	if (provider === "google") {
		return {
			google: {
				thinkingConfig: {
					includeThoughts: true,
				},
			},
		};
	}
	return undefined;
}
