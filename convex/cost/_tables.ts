import { defineTable } from "convex/server";
import { NewCostLedgerModel } from "./domain/costLedger.model";

/**
 * Append-only ledger table. All reads are range-scans keyed on either
 * `orgId` (dashboards) or `threadId` (thread detail). No point indexes
 * — every practical query is "rows between two timestamps within a
 * scope".
 *
 *  - `by_org_date`    — dashboard totals & per-org aggregations.
 *  - `by_agent_date`  — per-agent dashboard (M4-T07 agent switcher).
 *  - `by_thread`      — thread detail page (M2-T18 shows tool calls +
 *                       cost breakdown; skipping `createdAt` in the
 *                       composite because a thread's ledger rows are
 *                       already bounded and naturally sorted by _id).
 */
export const costTables = {
	costLedger: defineTable(NewCostLedgerModel.fields)
		.index("by_org_date", ["orgId", "createdAt"])
		.index("by_agent_date", ["agentId", "createdAt"])
		.index("by_thread", ["threadId"]),
};
