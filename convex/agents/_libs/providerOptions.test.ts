import { describe, expect, it } from "vitest";
import { buildProviderOptions } from "./providerOptions";

describe("buildProviderOptions", () => {
	it("enables Gemini reasoning emission for google provider", () => {
		expect(buildProviderOptions("google")).toEqual({
			google: { thinkingConfig: { includeThoughts: true } },
		});
	});

	it("returns undefined for anthropic (no global default)", () => {
		expect(buildProviderOptions("anthropic")).toBeUndefined();
	});

	it("returns undefined for unknown providers (forward-compat)", () => {
		expect(buildProviderOptions("openai")).toBeUndefined();
	});
});
