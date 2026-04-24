import { describe, expect, it } from "vitest";
import crons from "./crons";

/**
 * The Crons class exposes `.crons: Record<string, CronJob>` — we assert
 * against that registry rather than running the cron, so the test is a
 * cheap guardrail against accidental drift in schedule or identifier.
 */
describe("crons registry", () => {
	it("registers the hourly slack dedupe cleanup", () => {
		const job = crons.crons["slack:cleanExpiredDedupe"];
		expect(job).toBeDefined();
		expect(job?.schedule).toEqual({ type: "interval", hours: 1 });
	});

	it("registers the daily sandbox GC at 03:00 UTC", () => {
		const job = crons.crons["sandbox:gc"];
		expect(job).toBeDefined();
		expect(job?.schedule).toEqual({ type: "daily", hourUTC: 3, minuteUTC: 0 });
	});
});
