import { Crons } from "@convex-dev/crons";
import { components } from "../../_generated/api";

/**
 * The one `@convex-dev/crons` client for the events domain (M4-T03).
 *
 * This component is what makes user-created periodic events possible at all:
 * the native `cronJobs()` registry in `crons.ts` is compiled at deploy time and
 * cannot grow at runtime. Immediate and one-shot events don't come through
 * here — they ride `ctx.scheduler` directly, which already does durable
 * run-once scheduling natively.
 *
 * Registered names follow `event:<eventId>` (see `_libs/schedule.ts`) so the
 * component's registry and the `events` table can always be reconciled by eye,
 * and `crons.delete({ name })` needs nothing but the event row.
 */
export const crons = new Crons(components.crons);
