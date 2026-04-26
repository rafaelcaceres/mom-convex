import { describe, expect, it } from "vitest";
import type { Id } from "../../_generated/dataModel";
import type { Memory } from "../../memory/domain/memory.model";
import { MEMORY_CHAR_CAP, buildSystemPrompt } from "./systemPrompt";

function makeMemory(overrides: Partial<Memory> = {}): Memory {
	return {
		_id: "memory:1" as unknown as Id<"memory">,
		_creationTime: Date.now(),
		orgId: "org_A",
		scope: "org",
		content: "fact",
		alwaysOn: true,
		updatedBy: "users:u1" as unknown as Id<"users">,
		updatedAt: Date.now(),
		...overrides,
	};
}

describe("M2-T09 buildSystemPrompt", () => {
	it("produces stable markdown for a representative fixture", () => {
		const prompt = buildSystemPrompt({
			agent: {
				name: "ops-bot",
				systemPrompt: "You are a helpful operations assistant. Be concise.",
			},
			users: [
				{ id: "U1", name: "Alice", role: "owner" },
				{ id: "U2", name: "Bob" },
			],
			channels: [{ id: "C1", name: "ops", purpose: "operations chatter" }],
			skills: [
				{ skillKey: "http.fetch", name: "HTTP fetch", description: "Fetch a URL over HTTPS." },
				{
					skillKey: "memory.search",
					name: "Memory search",
					description: "Search memories by keyword.",
				},
			],
			memories: [
				makeMemory({
					_id: "memory:org" as unknown as Id<"memory">,
					scope: "org",
					content: "Company timezone is UTC.",
				}),
				makeMemory({
					_id: "memory:agent" as unknown as Id<"memory">,
					scope: "agent",
					agentId: "agents:a1" as unknown as Id<"agents">,
					content: "This agent prefers bullet lists.",
				}),
				makeMemory({
					_id: "memory:thread" as unknown as Id<"memory">,
					scope: "thread",
					agentId: "agents:a1" as unknown as Id<"agents">,
					threadId: "threads:t1" as unknown as Id<"threads">,
					content: "User wants short replies here.",
				}),
			],
		});

		expect(prompt).toMatchInlineSnapshot(`
			"You are a helpful operations assistant. Be concise.

			## Users
			- id=U1 name=Alice role=owner
			- id=U2 name=Bob

			## Channels
			- id=C1 name=ops purpose=operations chatter

			## Tools
			- \`http.fetch\` — HTTP fetch: Fetch a URL over HTTPS.
			- \`memory.search\` — Memory search: Search memories by keyword.

			## Memory
			### Organization
			- Company timezone is UTC.
			### Agent
			- This agent prefers bullet lists.
			### Thread
			- User wants short replies here."
		`);
	});

	it("places agent.systemPrompt at the very top", () => {
		const prompt = buildSystemPrompt({
			agent: { name: "n", systemPrompt: "TOPLINE INSTRUCTIONS" },
			users: [],
			channels: [],
			skills: [],
			memories: [],
		});
		expect(prompt.startsWith("TOPLINE INSTRUCTIONS\n\n")).toBe(true);
	});

	it("lists skills with key + name + description", () => {
		const prompt = buildSystemPrompt({
			agent: { name: "n", systemPrompt: "sp" },
			users: [],
			channels: [],
			skills: [
				{ skillKey: "foo.bar", name: "Foo Bar", description: "Do the thing." },
				{ skillKey: "baz.qux", name: "Baz Qux", description: "Do another thing." },
			],
			memories: [],
		});
		expect(prompt).toContain("## Tools");
		expect(prompt).toContain("foo.bar");
		expect(prompt).toContain("Foo Bar");
		expect(prompt).toContain("Do the thing.");
		expect(prompt).toContain("baz.qux");
		expect(prompt).toContain("Do another thing.");
	});

	it("orders memory scopes org → agent → thread", () => {
		const prompt = buildSystemPrompt({
			agent: { name: "n", systemPrompt: "sp" },
			users: [],
			channels: [],
			skills: [],
			memories: [
				makeMemory({
					_id: "memory:t" as unknown as Id<"memory">,
					scope: "thread",
					agentId: "agents:a1" as unknown as Id<"agents">,
					threadId: "threads:t1" as unknown as Id<"threads">,
					content: "T-content",
				}),
				makeMemory({
					_id: "memory:a" as unknown as Id<"memory">,
					scope: "agent",
					agentId: "agents:a1" as unknown as Id<"agents">,
					content: "A-content",
				}),
				makeMemory({
					_id: "memory:o" as unknown as Id<"memory">,
					scope: "org",
					content: "O-content",
				}),
			],
		});
		const iOrg = prompt.indexOf("### Organization");
		const iAgent = prompt.indexOf("### Agent");
		const iThread = prompt.indexOf("### Thread");
		expect(iOrg).toBeGreaterThan(0);
		expect(iAgent).toBeGreaterThan(iOrg);
		expect(iThread).toBeGreaterThan(iAgent);
	});

	it("sorts memories within a scope newest first (priority during truncation)", () => {
		const prompt = buildSystemPrompt({
			agent: { name: "n", systemPrompt: "sp" },
			users: [],
			channels: [],
			skills: [],
			memories: [
				makeMemory({
					_id: "memory:old" as unknown as Id<"memory">,
					scope: "org",
					content: "OLD",
					_creationTime: 1_000,
				}),
				makeMemory({
					_id: "memory:new" as unknown as Id<"memory">,
					scope: "org",
					content: "NEW",
					_creationTime: 2_000,
				}),
			],
		});
		expect(prompt.indexOf("NEW")).toBeLessThan(prompt.indexOf("OLD"));
	});

	it("caps memory content at ~10k chars and appends a truncation warning", () => {
		const chunk = "x".repeat(2_000);
		const memories = Array.from({ length: 10 }, (_, i) =>
			makeMemory({
				_id: `memory:${i}` as unknown as Id<"memory">,
				scope: "org",
				content: chunk,
				_creationTime: 10 - i,
			}),
		);
		const prompt = buildSystemPrompt({
			agent: { name: "n", systemPrompt: "sp" },
			users: [],
			channels: [],
			skills: [],
			memories,
		});
		expect(prompt).toContain("Additional memories omitted");
		const afterMemoryHeader = prompt.slice(prompt.indexOf("## Memory"));
		expect(afterMemoryHeader.length).toBeLessThan(MEMORY_CHAR_CAP + 500);
	});

	it("stays platform-agnostic when platform is unset (no Slack / Discord / mrkdwn references)", () => {
		const prompt = buildSystemPrompt({
			agent: { name: "n", systemPrompt: "You help teams." },
			users: [{ id: "U1", name: "Alice" }],
			channels: [{ id: "C1", name: "general" }],
			skills: [{ skillKey: "http.fetch", name: "HTTP fetch", description: "Fetch a URL." }],
			memories: [makeMemory({ scope: "org", content: "rule" })],
		});
		expect(prompt).not.toMatch(/slack/i);
		expect(prompt).not.toMatch(/discord/i);
		expect(prompt).not.toMatch(/mrkdwn/i);
	});

	it("stays platform-agnostic for non-Slack platforms (web, event)", () => {
		for (const platform of ["web", "event"] as const) {
			const prompt = buildSystemPrompt({
				agent: { name: "n", systemPrompt: "You help teams." },
				users: [],
				channels: [],
				skills: [],
				memories: [],
				platform,
			});
			expect(prompt, `platform=${platform}`).not.toMatch(/slack/i);
			expect(prompt, `platform=${platform}`).not.toMatch(/mrkdwn/i);
		}
	});

	it("appends a short Slack channel note when platform === 'slack'", () => {
		const prompt = buildSystemPrompt({
			agent: { name: "n", systemPrompt: "You help teams." },
			users: [],
			channels: [],
			skills: [],
			memories: [],
			platform: "slack",
		});
		expect(prompt).toContain("## Slack Channel");
		expect(prompt).toContain("@username");
		expect(prompt).toContain(":white_check_mark:");
		// We no longer teach the model mrkdwn — Block Kit translation handles it.
		expect(prompt).not.toMatch(/mrkdwn/i);
		expect(prompt).not.toMatch(/CRITICAL/);
	});

	it("places Slack note right after agent.systemPrompt and BEFORE Tools/Memory", () => {
		const prompt = buildSystemPrompt({
			agent: { name: "n", systemPrompt: "TOPLINE" },
			users: [],
			channels: [],
			skills: [{ skillKey: "k", name: "n", description: "d" }],
			memories: [makeMemory({ scope: "org", content: "fact" })],
			platform: "slack",
		});
		const iAgent = prompt.indexOf("TOPLINE");
		const iSlack = prompt.indexOf("## Slack Channel");
		const iTools = prompt.indexOf("## Tools");
		const iMemory = prompt.indexOf("## Memory");
		expect(iAgent).toBe(0);
		expect(iSlack).toBeGreaterThan(iAgent);
		expect(iSlack).toBeLessThan(iTools);
		expect(iSlack).toBeLessThan(iMemory);
	});

	it("skips users/channels when empty but always renders tools + memory", () => {
		const prompt = buildSystemPrompt({
			agent: { name: "n", systemPrompt: "sp" },
			users: [],
			channels: [],
			skills: [],
			memories: [],
		});
		expect(prompt).not.toContain("## Users");
		expect(prompt).not.toContain("## Channels");
		expect(prompt).toContain("## Tools\n(none)");
		expect(prompt).toContain("## Memory\n(none)");
	});

	it("stays well under 20k chars for a realistic input", () => {
		const prompt = buildSystemPrompt({
			agent: {
				name: "ops-bot",
				systemPrompt: "You are a helpful operations assistant.",
			},
			users: Array.from({ length: 20 }, (_, i) => ({
				id: `U${i}`,
				name: `user-${i}`,
			})),
			channels: Array.from({ length: 5 }, (_, i) => ({
				id: `C${i}`,
				name: `channel-${i}`,
			})),
			skills: [
				{ skillKey: "http.fetch", name: "HTTP fetch", description: "Fetch a URL." },
				{ skillKey: "memory.search", name: "Memory search", description: "Search memories." },
			],
			memories: Array.from({ length: 20 }, (_, i) =>
				makeMemory({
					_id: `memory:${i}` as unknown as Id<"memory">,
					scope: i < 5 ? "org" : i < 12 ? "agent" : "thread",
					agentId: "agents:a1" as unknown as Id<"agents">,
					threadId: "threads:t1" as unknown as Id<"threads">,
					content: `Memory fact ${i}`,
				}),
			),
		});
		expect(prompt.length).toBeLessThan(20_000);
	});
});
