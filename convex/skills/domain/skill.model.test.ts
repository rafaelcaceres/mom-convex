import { describe, expect, it } from "vitest";
import type { Id } from "../../_generated/dataModel";
import { type SkillCatalog, SkillCatalogAgg } from "./skill.model";

function makeSkill(overrides: Partial<SkillCatalog> = {}): SkillCatalog {
	return {
		_id: "skillCatalog:1" as unknown as Id<"skillCatalog">,
		_creationTime: Date.now(),
		key: "http.fetch",
		name: "HTTP Fetch",
		description: "Fetch an HTTP resource",
		zodSchemaJson: "{}",
		sideEffect: "read",
		enabled: true,
		...overrides,
	};
}

describe("M2-T02 SkillCatalogAgg", () => {
	it("getModel returns the underlying doc", () => {
		const skill = makeSkill();
		const agg = new SkillCatalogAgg(skill);
		expect(agg.getModel()).toBe(skill);
	});

	it("requiresConfirmation is true when sideEffect === 'write'", () => {
		const agg = new SkillCatalogAgg(makeSkill({ sideEffect: "write" }));
		expect(agg.requiresConfirmation()).toBe(true);
	});

	it("requiresConfirmation is false for read-only skills", () => {
		const agg = new SkillCatalogAgg(makeSkill({ sideEffect: "read" }));
		expect(agg.requiresConfirmation()).toBe(false);
	});

	// Bash `rm -rf` heuristic lives in M2-T05 (skills.invoke), not here — it
	// needs the actual call args which the aggregate alone doesn't see. The
	// aggregate only enforces the declarative `sideEffect` marker.
});
