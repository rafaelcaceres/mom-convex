import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateMasterKeyBase64 } from "../../_shared/_libs/crypto";
import { signOAuthState, verifyOAuthState } from "./oauthState";

const ORIGINAL_KEY = process.env.CREDS_MASTER_KEY;

describe("M1-T05 OAuth state HMAC", () => {
	beforeEach(() => {
		process.env.CREDS_MASTER_KEY = generateMasterKeyBase64();
	});
	afterEach(() => {
		if (ORIGINAL_KEY === undefined) {
			// biome-ignore lint/performance/noDelete: test isolation
			delete process.env.CREDS_MASTER_KEY;
		} else {
			process.env.CREDS_MASTER_KEY = ORIGINAL_KEY;
		}
	});

	it("sign + verify round-trip recovers the orgId", async () => {
		const state = await signOAuthState({ orgId: "org_A", nowMs: 1_000_000 });
		const verified = await verifyOAuthState({ state, nowMs: 1_000_000 });
		expect(verified).toEqual({ orgId: "org_A" });
	});

	it("verify rejects tampered orgId", async () => {
		const state = await signOAuthState({ orgId: "org_A", nowMs: 1_000_000 });
		// Replace orgId in the first segment while keeping the same HMAC
		const [, nonce, iat, sig] = state.split(".");
		const tampered = ["org_B", nonce, iat, sig].join(".");
		const result = await verifyOAuthState({ state: tampered, nowMs: 1_000_000 });
		expect(result).toBeNull();
	});

	it("verify rejects expired state (>10 min old)", async () => {
		const state = await signOAuthState({ orgId: "org_A", nowMs: 1_000_000 });
		const tenMinuteMs = 10 * 60 * 1000;
		const result = await verifyOAuthState({
			state,
			nowMs: 1_000_000 + tenMinuteMs + 1,
		});
		expect(result).toBeNull();
	});

	it("verify rejects state signed with a different secret", async () => {
		const state = await signOAuthState({ orgId: "org_A", nowMs: 1_000_000 });
		// Rotate the key → previous signature should no longer verify
		process.env.CREDS_MASTER_KEY = generateMasterKeyBase64();
		const result = await verifyOAuthState({ state, nowMs: 1_000_000 });
		expect(result).toBeNull();
	});

	it("verify rejects obviously malformed states", async () => {
		const a = await verifyOAuthState({ state: "garbage", nowMs: 1_000_000 });
		const b = await verifyOAuthState({ state: "a.b.c", nowMs: 1_000_000 });
		expect(a).toBeNull();
		expect(b).toBeNull();
	});

	it("two calls produce different states (fresh nonce)", async () => {
		const a = await signOAuthState({ orgId: "org_A", nowMs: 1_000_000 });
		const b = await signOAuthState({ orgId: "org_A", nowMs: 1_000_000 });
		expect(a).not.toBe(b);
	});
});
