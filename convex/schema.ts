import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { agentTables } from "./agents/_tables";
import { memoryTables } from "./memory/_tables";
import { skillTables } from "./skills/_tables";
import { slackTables } from "./slack/_tables";
import { threadTables } from "./threads/_tables";

export default defineSchema({
	...authTables,
	...agentTables,
	...threadTables,
	...slackTables,
	...skillTables,
	...memoryTables,

	// Test-only fixture table used by repository factory tests (M0-T04).
	// Safe to keep: domains register their real tables via their own `_tables.ts`.
	testFixtures: defineTable({
		name: v.string(),
		value: v.optional(v.number()),
	}).index("by_name", ["name"]),
});
