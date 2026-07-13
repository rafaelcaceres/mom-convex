import { defineTable } from "convex/server";
import { NewEventModel } from "./domain/event.model";

/**
 * `by_agent` — the UI list (M4-T04) and cascade-cleanup when an agent is deleted.
 *
 * `by_org_status` — live events for a tenant, without scanning the org's history
 * of fired one-shots.
 *
 * `by_next_run` — the reconciliation sweep (`listReady`). Keyed on `status`
 * *before* `nextRunAt` on purpose: the query is always "live events that are
 * due", and leading with status keeps the scan inside the live partition instead
 * of walking every one-shot the org has ever fired. `nextRunAt` is optional and
 * is cleared whenever an event stops being live, so dead rows drop out of the
 * range as well as out of the prefix — belt and braces, because a reminder that
 * fires after being cancelled is worse than one that never fires.
 */
export const eventTables = {
	events: defineTable(NewEventModel.fields)
		.index("by_agent", ["agentId"])
		.index("by_org_status", ["orgId", "status"])
		.index("by_next_run", ["status", "nextRunAt"]),
};
