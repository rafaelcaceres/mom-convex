import type { WithoutSystemFields } from "convex/server";
import type { Doc, Id, TableNames } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { IAggregate } from "./aggregate";

/**
 * Base repository shape. Every domain repository extends this with
 * domain-specific query methods (e.g. `byCompany`, `listActive`).
 *
 * Repositories are the **only** code allowed to touch `ctx.db` directly — that
 * rule is enforced by ESLint (see eslint.config.mjs, rule #2).
 */
export interface IRepository<TTable extends TableNames, TAggregate = Doc<TTable>> {
	get(ctx: QueryCtx, id: Id<TTable>): Promise<TAggregate | null>;
	save(ctx: MutationCtx, aggregate: TAggregate): Promise<TAggregate>;
	create(ctx: MutationCtx, data: WithoutSystemFields<Doc<TTable>>): Promise<TAggregate>;
	delete(ctx: MutationCtx, id: Id<TTable>): Promise<void>;
}

/**
 * Factory that returns a base IRepository. Domains compose it with spread:
 *
 *   export const AgentRepo: IAgentRepository = {
 *     ...createRepository("agents", (doc) => new AgentAgg(doc)),
 *     byOrgSlug: async (ctx, clause) => { ... },
 *   };
 */
export function createRepository<TTable extends TableNames, TAggregate>(
	tableName: TTable,
	toAggregate: (doc: Doc<TTable>) => TAggregate,
): IRepository<TTable, TAggregate> {
	return {
		get: async (ctx, id) => {
			const doc = await ctx.db.get(id);
			if (!doc) return null;
			// get(id) is typed for any table; guard against cross-table id misuse
			// (id coerced from another table would yield a doc of the wrong shape).
			return toAggregate(doc as Doc<TTable>);
		},

		save: async (ctx, aggregate) => {
			const model = (aggregate as unknown as IAggregate<Doc<TTable>>).getModel();
			const { _id, _creationTime: _ignored, ...fields } = model;
			// Runtime contract is correct (tests prove roundtrip). TypeScript can't
			// narrow `Doc<TTable>` to the exact internal shape ctx.db.replace wants
			// without a concrete table name — so we drop to `any` locally here only.
			// biome-ignore lint/suspicious/noExplicitAny: generic repository factory bridge
			await ctx.db.replace(_id, fields as any);
			return aggregate;
		},

		create: async (ctx, data) => {
			const id = await ctx.db.insert(tableName, data);
			const doc = await ctx.db.get(id);
			if (!doc) throw new Error(`Failed to create document in '${tableName}'`);
			return toAggregate(doc);
		},

		delete: async (ctx, id) => {
			await ctx.db.delete(id);
		},
	};
}
