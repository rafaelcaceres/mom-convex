import { type Infer, v } from "convex/values";
import type { IAggregate } from "../../_shared/_libs/aggregate";

/**
 * Threads wrap conversations originating from any platform adapter (Slack,
 * web chat, scheduled events). The `binding` discriminated union captures the
 * origin; `bindingKey` is a denormalized canonical serialization used for a
 * single `by_org_binding` index — keeping CRUD paths simple across all types.
 *
 * `agentThreadId` is opaque in M1 (a placeholder string). M2-T01 will point it
 * at the `@convex-dev/agent` component's thread id so `useThreadMessages` has
 * something to subscribe to.
 */

export const SlackBindingModel = v.object({
	type: v.literal("slack"),
	installId: v.string(),
	channelId: v.string(),
	threadTs: v.optional(v.string()),
	// Anchor for tool-call thread replies (F-03). The bot's main reply for the
	// current Slack turn lands here; subsequent tool-call replies (and the
	// final-text edit) hang off of it. Survives crashes: persisted via
	// `internal.threads.mutations.setThreadParentTs` so a retried turn doesn't
	// duplicate the anchor message. Excluded from `bindingKey` because thread
	// identity is the user's slack thread (`threadTs`), not the bot's anchor.
	parentTs: v.optional(v.string()),
});

export const WebBindingModel = v.object({
	type: v.literal("web"),
	userId: v.id("users"),
});

export const EventBindingModel = v.object({
	type: v.literal("event"),
	eventId: v.string(),
});

export const AdapterBindingModel = v.union(SlackBindingModel, WebBindingModel, EventBindingModel);

export const NewThreadModel = v.object({
	orgId: v.string(),
	agentId: v.id("agents"),
	agentThreadId: v.string(),
	binding: AdapterBindingModel,
	bindingKey: v.string(),
});

export const ThreadModel = v.object({
	_id: v.id("threads"),
	_creationTime: v.number(),
	...NewThreadModel.fields,
});

export type SlackBinding = Infer<typeof SlackBindingModel>;
export type WebBinding = Infer<typeof WebBindingModel>;
export type EventBinding = Infer<typeof EventBindingModel>;
export type AdapterBinding = Infer<typeof AdapterBindingModel>;
export type NewThread = Infer<typeof NewThreadModel>;
export type Thread = Infer<typeof ThreadModel>;

export function bindingKey(binding: AdapterBinding): string {
	switch (binding.type) {
		case "slack":
			return `slack:${binding.installId}:${binding.channelId}:${binding.threadTs ?? ""}`;
		case "web":
			return `web:${binding.userId}`;
		case "event":
			return `event:${binding.eventId}`;
	}
}

export class ThreadAgg implements IAggregate<Thread> {
	constructor(private readonly thread: Thread) {}

	getModel(): Thread {
		return this.thread;
	}

	setAgentThreadId(next: string): void {
		this.thread.agentThreadId = next;
	}

	setParentTs(ts: string): void {
		if (this.thread.binding.type !== "slack") {
			throw new Error("setParentTs requires a slack binding");
		}
		this.thread.binding = { ...this.thread.binding, parentTs: ts };
	}
}
