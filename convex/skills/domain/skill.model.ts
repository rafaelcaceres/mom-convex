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
	/**
	 * Whether a human must approve each call. Defaults to `sideEffect === "write"`
	 * when absent, which is why existing catalog rows keep their behaviour.
	 *
	 * Split from `sideEffect` because the two answer different questions.
	 * `sideEffect` describes what the skill *does* — it feeds the audit log and
	 * tells the model whether a call is repeatable. Confirmation is *policy*:
	 * how much do we trust the agent to do this unsupervised? Conflating them
	 * forces a false choice for a skill like `memory.save`, which genuinely
	 * writes but writes a reversible, tenant-scoped row in our own database —
	 * nothing like `sandbox.bash`, which needs a human precisely because it
	 * executes arbitrary code. The alternative (mislabelling it `read`) would
	 * corrupt the audit trail to buy a policy exemption.
	 */
	requiresConfirmation: v.optional(v.boolean()),
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
	 * Declarative gate: does a call need human approval (M3-T11)?
	 *
	 * Defaults to "yes" for writes, so a skill author who says nothing gets the
	 * safe answer. An entry opts out explicitly by setting
	 * `requiresConfirmation: false` — a deliberate act, visible in the catalog.
	 *
	 * Per-call heuristics (e.g. a bash skill declared `read` but invoked with
	 * `rm -rf`) live in `skills.invoke` (M2-T05), which sees the runtime args
	 * and can gate a call this method would have waved through.
	 */
	requiresConfirmation(): boolean {
		return this.skill.requiresConfirmation ?? this.skill.sideEffect === "write";
	}
}
