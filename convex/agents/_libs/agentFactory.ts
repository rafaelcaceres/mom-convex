import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { Agent } from "@convex-dev/agent";
import { components } from "../../_generated/api";

type AnthropicModel = ReturnType<typeof anthropic>;

/**
 * Lazy, cached `@convex-dev/agent` Agent instances keyed by
 * `${orgId}:${agentId}:${modelId}`. Construction is cheap, but the cache
 * matters because the Agent holds per-instance language-model config that
 * we don't want to rebuild on every action invocation.
 *
 * Cache key intentionally excludes `systemPrompt` and `toolsAllowlist` —
 * those are recomputed per-turn (M2-T09 system prompt builder, M2-T04
 * resolveTools) and passed via prompt args, not baked into the Agent.
 */

export type AgentFactoryInput = {
	orgId: string;
	agentId: string;
	modelId: string;
	modelProvider: string;
	name: string;
	systemPrompt: string;
	toolsAllowlist?: string[];
};

const cache = new Map<string, Agent>();
let testModelOverride: LanguageModelV3 | null = null;

function cacheKey(input: AgentFactoryInput): string {
	return `${input.orgId}:${input.agentId}:${input.modelId}`;
}

function resolveLanguageModel(provider: string, modelId: string): LanguageModelV3 {
	if (testModelOverride) return testModelOverride;
	switch (provider) {
		case "anthropic":
			return anthropic(modelId) satisfies AnthropicModel;
		default:
			throw new Error(
				`agentFactory: unsupported model provider '${provider}'. Only 'anthropic' is supported in M2-T01.`,
			);
	}
}

export function getAgent(input: AgentFactoryInput): Agent {
	const key = cacheKey(input);
	const cached = cache.get(key);
	if (cached) return cached;

	const agent = new Agent(components.agent, {
		name: input.name,
		languageModel: resolveLanguageModel(input.modelProvider, input.modelId),
		instructions: input.systemPrompt,
	});
	cache.set(key, agent);
	return agent;
}

export function _clearAgentCache(): void {
	cache.clear();
}

/**
 * Test hook: force `resolveLanguageModel` to return the supplied model on
 * every call, bypassing the provider switch. Pair with `_clearAgentCache()`
 * so existing cached Agents don't reuse a real provider from before.
 * Pass `null` to clear.
 */
export function _setLanguageModelOverride(model: LanguageModelV3 | null): void {
	testModelOverride = model;
}
