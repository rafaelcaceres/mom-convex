import { describe, expect, it } from "vitest";
import { MODEL_PRICES } from "../../cost/_libs/modelPrices";
import { SUPPORTED_MODELS, isSupportedModel } from "./supportedModels";

describe("supportedModels", () => {
	it("every listed model has a priced entry in MODEL_PRICES", () => {
		const priced = new Set(Object.keys(MODEL_PRICES));
		for (const m of SUPPORTED_MODELS) {
			expect(priced.has(m.modelId), `missing price for ${m.modelId}`).toBe(true);
		}
	});

	it("isSupportedModel matches catalog", () => {
		expect(isSupportedModel("claude-sonnet-4-5")).toBe(true);
		expect(isSupportedModel("gpt-4-turbo")).toBe(false);
	});
});
