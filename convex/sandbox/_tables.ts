import { defineTable } from "convex/server";
import { NewSandboxModel } from "./domain/sandbox.model";

/**
 * One row per live Vercel sandbox owned by a thread.
 *
 *  - `by_thread` — `getByThread` uses this: a thread has at most one
 *    non-destroyed sandbox, so the scan is O(1..few rows). We don't add
 *    `status` to the index because the destroyed-row count per thread is
 *    bounded (each thread destroys at most a handful over its life).
 *
 *  - `by_status_lastUsedAt` — composite powering the GC sweep (M2-T16).
 *    Query shape: `status == "active"` AND `lastUsedAt < threshold`. The
 *    index lets us range-scan within the active partition without reading
 *    stopped/destroyed rows.
 */
export const sandboxTables = {
	sandboxes: defineTable(NewSandboxModel.fields)
		.index("by_thread", ["threadId"])
		.index("by_status_lastUsedAt", ["status", "lastUsedAt"]),
};
