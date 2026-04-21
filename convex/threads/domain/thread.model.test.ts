import { describe, expect, it } from "vitest";
import type { Id } from "../../_generated/dataModel";
import { type Thread, ThreadAgg, bindingKey } from "./thread.model";

function makeThread(overrides: Partial<Thread> = {}): Thread {
	return {
		_id: "threads:1" as unknown as Id<"threads">,
		_creationTime: Date.now(),
		orgId: "org_A",
		agentId: "agents:1" as unknown as Id<"agents">,
		agentThreadId: "agent_thread_1",
		binding: {
			type: "web",
			userId: "users:1" as unknown as Id<"users">,
		},
		bindingKey: "web:users:1",
		...overrides,
	};
}

describe("M1-T02 bindingKey", () => {
	it("derives deterministic key for slack bindings (with threadTs)", () => {
		const key = bindingKey({
			type: "slack",
			installId: "si_1",
			channelId: "C123",
			threadTs: "1234.567",
		});
		expect(key).toBe("slack:si_1:C123:1234.567");
	});

	it("derives key for slack bindings without threadTs (channel root)", () => {
		const key = bindingKey({
			type: "slack",
			installId: "si_1",
			channelId: "C123",
		});
		expect(key).toBe("slack:si_1:C123:");
	});

	it("derives key for web bindings", () => {
		const key = bindingKey({
			type: "web",
			userId: "users:abc" as unknown as Id<"users">,
		});
		expect(key).toBe("web:users:abc");
	});

	it("derives key for event bindings", () => {
		const key = bindingKey({
			type: "event",
			eventId: "evt_1",
		});
		expect(key).toBe("event:evt_1");
	});

	it("identical bindings produce identical keys (idempotency)", () => {
		const b = {
			type: "slack" as const,
			installId: "si_1",
			channelId: "C1",
			threadTs: "1.1",
		};
		expect(bindingKey(b)).toBe(bindingKey({ ...b }));
	});
});

describe("M1-T02 ThreadAgg", () => {
	it("getModel returns the underlying doc", () => {
		const t = makeThread();
		const agg = new ThreadAgg(t);
		expect(agg.getModel()).toBe(t);
	});

	it("setAgentThreadId updates the opaque reference", () => {
		const agg = new ThreadAgg(makeThread({ agentThreadId: "old" }));
		agg.setAgentThreadId("new");
		expect(agg.getModel().agentThreadId).toBe("new");
	});
});
