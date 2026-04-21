import { type Infer, v } from "convex/values";
import type { IAggregate } from "../../_shared/_libs/aggregate";

/**
 * Built-in skills catalog (org-independent). Each entry declares the shape of
 * the skill's tool call (`zodSchemaJson` — a JSON schema serialized from a zod
 * schema at seed time) plus metadata that `resolveTools` (M2-T04) and
 * `skills.invoke` (M2-T05) consume.
 *
 * The catalog is a static registry seeded into Convex so the dashboard can
 * list it and `agentSkills` (M2-T03) can reference rows by `_id`/`key`.
 */

export const NewSkillCatalogModel = v.object({
	key: v.string(),
	name: v.string(),
	description: v.string(),
	zodSchemaJson: v.string(),
	requiredCredType: v.optional(v.string()),
	sideEffect: v.union(v.literal("read"), v.literal("write")),
	enabled: v.boolean(),
});

export const SkillCatalogModel = v.object({
	_id: v.id("skillCatalog"),
	_creationTime: v.number(),
	...NewSkillCatalogModel.fields,
});

export type NewSkillCatalog = Infer<typeof NewSkillCatalogModel>;
export type SkillCatalog = Infer<typeof SkillCatalogModel>;

export class SkillCatalogAgg implements IAggregate<SkillCatalog> {
	constructor(private readonly skill: SkillCatalog) {}

	getModel(): SkillCatalog {
		return this.skill;
	}

	/**
	 * Declarative gate: any skill marked `write` must go through the
	 * human-in-loop flow (M3-T11). Per-call heuristics (e.g. a bash skill
	 * declared `read` but called with `rm -rf`) live in `skills.invoke`
	 * (M2-T05), which has access to the runtime args.
	 */
	requiresConfirmation(): boolean {
		return this.skill.sideEffect === "write";
	}
}
