import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { priceFromUsage } from "./priceFromUsage";

describe("M2-T15 priceFromUsage", () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
	});
	afterEach(() => {
		warnSpy.mockRestore();
	});

	it("known model: prices non-cached input + output at their rates (sonnet 4.5)", () => {
		// sonnet: $3/M input, $15/M output, $0.30/M cacheRead, $3.75/M cacheWrite.
		// 100 input (all non-cached) + 200 output → 100*3 + 200*15 = 300 + 3000 = 3300 / 1M = 0.0033.
		const result = priceFromUsage({
			model: "claude-sonnet-4-5",
			usage: { inputTokens: 100, outputTokens: 200 },
		});
		expect(result).toMatchObject({
			tokensIn: 100,
			tokensOut: 200,
			cacheRead: 0,
			cacheWrite: 0,
		});
		expect(result.costUsd).toBeCloseTo(0.0033, 6);
	});

	it("known model: subtracts cacheRead from non-cached slice and prices cache reads separately", () => {
		// inputTokens=150, cacheRead=50 → nonCache=100; outputTokens=0.
		// cost = (100 * 3 + 50 * 0.30) / 1M = (300 + 15) / 1M = 0.000315
		const result = priceFromUsage({
			model: "claude-sonnet-4-5",
			usage: {
				inputTokens: 150,
				outputTokens: 0,
				inputTokenDetails: { cacheReadTokens: 50 },
			},
		});
		expect(result.cacheRead).toBe(50);
		expect(result.costUsd).toBeCloseTo(0.000315, 7);
	});

	it("known model: honors explicit noCacheTokens when provider supplies it", () => {
		// Provider sends noCacheTokens=40 even though (150 - 50 read) would be 100
		// — we trust the explicit split (matters for providers that report
		// overlapping/unusual counts).
		const result = priceFromUsage({
			model: "claude-sonnet-4-5",
			usage: {
				inputTokens: 150,
				outputTokens: 0,
				inputTokenDetails: { cacheReadTokens: 50, noCacheTokens: 40 },
			},
		});
		// cost = (40 * 3 + 50 * 0.3) / 1M = (120 + 15) / 1M = 0.000135
		expect(result.costUsd).toBeCloseTo(0.000135, 7);
	});

	it("known model: prices cache writes with the write premium", () => {
		// inputTokens=100 all cache-write; cost = 100 * 3.75 / 1M = 0.000375
		const result = priceFromUsage({
			model: "claude-sonnet-4-5",
			usage: {
				inputTokens: 100,
				outputTokens: 0,
				inputTokenDetails: { cacheWriteTokens: 100 },
			},
		});
		expect(result.cacheWrite).toBe(100);
		expect(result.costUsd).toBeCloseTo(0.000375, 7);
	});

	it("unknown model: costUsd=0 but tokens still flow through + warns", () => {
		const result = priceFromUsage({
			model: "gpt-5-imaginary",
			usage: { inputTokens: 100, outputTokens: 200 },
		});
		expect(result).toEqual({
			tokensIn: 100,
			tokensOut: 200,
			cacheRead: 0,
			cacheWrite: 0,
			costUsd: 0,
		});
		expect(warnSpy).toHaveBeenCalledTimes(1);
		expect(warnSpy.mock.calls[0]?.[0]).toMatch(/gpt-5-imaginary/);
	});

	it("missing usage fields: defaults everything to 0", () => {
		const result = priceFromUsage({ model: "claude-sonnet-4-5", usage: {} });
		expect(result).toEqual({
			tokensIn: 0,
			tokensOut: 0,
			cacheRead: 0,
			cacheWrite: 0,
			costUsd: 0,
		});
	});

	it("opus pricing is 5x sonnet input + 5x sonnet output", () => {
		const sonnet = priceFromUsage({
			model: "claude-sonnet-4-5",
			usage: { inputTokens: 1_000, outputTokens: 1_000 },
		});
		const opus = priceFromUsage({
			model: "claude-opus-4-7",
			usage: { inputTokens: 1_000, outputTokens: 1_000 },
		});
		expect(opus.costUsd / sonnet.costUsd).toBeCloseTo(5, 5);
	});
});
