import { type Infer, v } from "convex/values";
import type { IAggregate } from "../../_shared/_libs/aggregate";

/**
 * Agents are per-org configurations: system prompt + model choice + skills.
 * Every org has exactly one `isDefault: true` agent; bindings not matched by a
 * specific routing rule fall back to the default (see M4-T05).
 *
 * `orgId` is a plain string because it references the `@djpanda/convex-tenants`
 * component's internal `organizations._id`, which is opaque from our app.
 */

export const NewAgentModel = v.object({
	orgId: v.string(),
	slug: v.string(),
	name: v.string(),
	systemPrompt: v.string(),
	modelId: v.string(),
	modelProvider: v.string(),
	isDefault: v.boolean(),
	toolsAllowlist: v.array(v.string()),
});

export const AgentModel = v.object({
	_id: v.id("agents"),
	_creationTime: v.number(),
	...NewAgentModel.fields,
});

export type NewAgent = Infer<typeof NewAgentModel>;
export type Agent = Infer<typeof AgentModel>;

export class AgentAgg implements IAggregate<Agent> {
	constructor(private readonly agent: Agent) {}

	getModel(): Agent {
		return this.agent;
	}

	markAsDefault(): void {
		if (this.agent.isDefault) return;
		this.agent.isDefault = true;
	}

	unmarkDefault(): void {
		if (!this.agent.isDefault) return;
		this.agent.isDefault = false;
	}

	updateSystemPrompt(next: string): void {
		if (next.trim().length === 0) {
			throw new Error("systemPrompt cannot be empty");
		}
		this.agent.systemPrompt = next;
	}
}
