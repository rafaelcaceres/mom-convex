import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import {
	action as rawAction,
	internalAction as rawInternalAction,
	internalMutation as rawInternalMutation,
	internalQuery as rawInternalQuery,
	mutation as rawMutation,
	query as rawQuery,
} from "./_generated/server";
import { triggers } from "./_triggers";

/**
 * DDD-aware wrappers around Convex's raw function builders.
 *
 * All domain code must import `mutation`, `query`, etc. from this file (never
 * `_generated/server`). That indirection lets us wire cross-cutting concerns —
 * today just the `triggers` registry, tomorrow audit logging, rate limits, etc.
 *
 * Enforced by ESLint rule `no-restricted-imports` in `eslint.config.mjs`.
 */

export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));

// Queries don't mutate, but we wrap them for symmetry — future
// cross-cutting read concerns (audit, tenant scoping) will plug in here.
export const query = customQuery(
	rawQuery,
	customCtx(async () => ({})),
);
export const internalQuery = customQuery(
	rawInternalQuery,
	customCtx(async () => ({})),
);

// Actions don't touch the DB directly; re-export as-is for a consistent import path.
export const action = rawAction;
export const internalAction = rawInternalAction;
