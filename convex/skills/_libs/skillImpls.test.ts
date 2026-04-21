import { afterEach, describe, expect, it, vi } from "vitest";
import { _resetSkillRegistry, getSkillImpl, registerSkill } from "./skillImpls";

describe("M2-T05 skillImpls registry", () => {
	afterEach(() => {
		_resetSkillRegistry();
	});

	it("registers and retrieves an impl by key", () => {
		const impl = vi.fn();
		registerSkill("test.echo", impl);
		expect(getSkillImpl("test.echo")).toBe(impl);
	});

	it("last registration wins (lets tasks upgrade a stub to a real impl)", () => {
		const stub = vi.fn();
		const real = vi.fn();
		registerSkill("test.echo", stub);
		registerSkill("test.echo", real);
		expect(getSkillImpl("test.echo")).toBe(real);
	});

	it("returns undefined for unknown keys", () => {
		expect(getSkillImpl("nope.nope")).toBeUndefined();
	});

	it("_resetSkillRegistry clears everything (for test isolation)", () => {
		registerSkill("test.x", vi.fn());
		_resetSkillRegistry();
		expect(getSkillImpl("test.x")).toBeUndefined();
	});
});
