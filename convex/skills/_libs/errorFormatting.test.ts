import { describe, expect, it } from "vitest";
import { formatImplError, redactSecrets, truncateStack } from "./errorFormatting";

describe("M2-T05 errorFormatting", () => {
	describe("redactSecrets", () => {
		it("redacts Anthropic-style keys", () => {
			expect(redactSecrets("Using sk-ant-api03-abcdefghijklmno in call")).toMatch(/\[REDACTED\]/);
		});
		it("redacts Bearer tokens", () => {
			expect(redactSecrets('headers: "Authorization: Bearer eyJabc.def.ghi123"')).toMatch(
				/Bearer \[REDACTED\]/,
			);
		});
		it("redacts Slack bot tokens", () => {
			expect(redactSecrets("token=xoxb-1234567890-abcdef")).toMatch(/\[REDACTED\]/);
		});
		it("redacts password JSON fields", () => {
			const input = '{"username":"foo","password":"p@ssw0rd123"}';
			expect(redactSecrets(input)).toContain('"password":"[REDACTED]"');
			expect(redactSecrets(input)).not.toContain("p@ssw0rd123");
		});
		it("leaves harmless text alone", () => {
			expect(redactSecrets("hello world 42")).toBe("hello world 42");
		});
	});

	describe("truncateStack", () => {
		it("keeps first N lines and appends a marker when truncated", () => {
			const long = Array.from({ length: 20 }, (_, i) => `at frame${i}`).join("\n");
			const out = truncateStack(long, 5);
			expect(out.split("\n").length).toBeLessThanOrEqual(6);
			expect(out).toContain("truncated");
		});
		it("leaves short stacks alone", () => {
			const short = "Error: X\n    at a\n    at b";
			expect(truncateStack(short, 10)).toBe(short);
		});
	});

	describe("formatImplError", () => {
		it("produces a structured MCP-style error result", () => {
			const err = new Error("Upstream 500: token=sk-ant-api03-abc123xyz");
			err.stack = "Error: Upstream 500\n    at a\n    at b\n    at c";
			const out = formatImplError({ skillKey: "http.fetch", err });

			expect(out.isError).toBe(true);
			expect(out.content[0]?.type).toBe("text");
			expect(out.content[0]?.text).toMatch(/http\.fetch/);
			expect(out.content[0]?.text).not.toContain("sk-ant-api03-abc123xyz");
		});
		it("handles non-Error throws", () => {
			const out = formatImplError({ skillKey: "memory.search", err: "raw string oops" });
			expect(out.isError).toBe(true);
			expect(out.content[0]?.text).toContain("raw string oops");
		});
	});
});
