import type { ActionCtx } from "../../_generated/server";
import type { ToolInvokeScope } from "./resolveTools";

/**
 * Runtime registry of skill implementations. Each skill in the catalog must
 * have (at most) one impl registered here — `internal.skills.actions.invoke`
 * looks up the impl by key and dispatches.
 *
 * Kept as a side-effectful singleton intentionally:
 *  - future per-skill files (M2-T06+: `impls/httpFetch.ts`, ...) each call
 *    `registerSkill` at module-load time;
 *  - `invoke.ts` imports `impls/_stubs` for side-effects so the registry is
 *    populated before the first dispatch;
 *  - tests call `_resetSkillRegistry()` in `beforeEach` and register mocks.
 *
 * "Last registration wins" is deliberate: M2-T06 replacing the http.fetch
 * stub can either edit the stub file or add a new file — both work because
 * registration order resolves the conflict. Keep the production import list
 * explicit (no glob) so the behavior is traceable in the git log.
 */

export type SkillImpl = (
	ctx: ActionCtx,
	input: unknown,
	options: { signal: AbortSignal; scope: ToolInvokeScope; config?: unknown },
) => Promise<unknown>;

const registry = new Map<string, SkillImpl>();

export function registerSkill(key: string, impl: SkillImpl): void {
	registry.set(key, impl);
}

export function getSkillImpl(key: string): SkillImpl | undefined {
	return registry.get(key);
}

export function _resetSkillRegistry(): void {
	registry.clear();
}
