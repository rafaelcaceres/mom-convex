import { Triggers } from "convex-helpers/server/triggers";
import type { DataModel } from "./_generated/dataModel";
import { seedBaselineSkillsForAgent } from "./skills/_triggers";

/**
 * Central trigger registry. Sub-domains expose handler functions from their
 * own `_triggers.ts`; this module imports and wires them into the singleton.
 *
 * We do registrations centrally (instead of letting each domain call
 * `triggers.register(...)` from its own module) to avoid an ES-module cycle:
 * `customFunctions.ts` imports this file, so any domain module that also
 * imported this file to register a trigger would be initialized before the
 * `triggers` export is assigned.
 */
export const triggers = new Triggers<DataModel>();

triggers.register("agents", seedBaselineSkillsForAgent);
