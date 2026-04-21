/**
 * Anti-CSRF state for Slack OAuth install flow.
 *
 * Format: `<orgId>.<nonce>.<issuedAtMs>.<hmacHex>`
 * Signed with HMAC-SHA256 using `CREDS_MASTER_KEY` (same key as our at-rest
 * crypto lib — avoids adding another env variable). Verified by recomputing
 * the HMAC and checking the timestamp is ≤ 10 min old.
 *
 * The install httpAction issues a state before redirecting to Slack; the
 * callback verifies that it came back intact. That guarantees the `orgId`
 * passed through the redirect chain was not swapped by an attacker.
 */

import { decodeBase64 } from "../../_shared/_libs/base64";

const STATE_TTL_MS = 10 * 60 * 1000;
const KEY_LENGTH_BYTES = 32;

export interface SignedOAuthState {
	orgId: string;
}

function loadKey(): Uint8Array<ArrayBuffer> {
	const raw = process.env.CREDS_MASTER_KEY;
	if (!raw) throw new Error("CREDS_MASTER_KEY is not set");
	const bytes = decodeBase64(raw);
	if (bytes.length !== KEY_LENGTH_BYTES) {
		throw new Error(`CREDS_MASTER_KEY must decode to ${KEY_LENGTH_BYTES} bytes`);
	}
	return bytes;
}

async function hmacHex(message: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		loadKey(),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
	const bytes = new Uint8Array(sig);
	let hex = "";
	for (let i = 0; i < bytes.length; i++) {
		hex += (bytes[i] as number).toString(16).padStart(2, "0");
	}
	return hex;
}

function randomHex(bytes: number): string {
	const buf = new Uint8Array(new ArrayBuffer(bytes));
	crypto.getRandomValues(buf);
	let hex = "";
	for (let i = 0; i < buf.length; i++) {
		hex += (buf[i] as number).toString(16).padStart(2, "0");
	}
	return hex;
}

export async function signOAuthState(args: {
	orgId: string;
	nowMs?: number;
}): Promise<string> {
	const iat = args.nowMs ?? Date.now();
	const nonce = randomHex(16);
	const body = `${args.orgId}.${nonce}.${iat}`;
	const sig = await hmacHex(body);
	return `${body}.${sig}`;
}

/**
 * Returns the verified payload, or `null` if the state is tampered, expired
 * or malformed. Constant-time compare keeps timing uniform.
 */
export async function verifyOAuthState(args: {
	state: string;
	nowMs?: number;
}): Promise<SignedOAuthState | null> {
	const nowMs = args.nowMs ?? Date.now();
	const parts = args.state.split(".");
	if (parts.length !== 4) return null;
	const [orgId, nonce, iatStr, sig] = parts;
	if (!orgId || !nonce || !iatStr || !sig) return null;

	const iat = Number(iatStr);
	if (!Number.isFinite(iat)) return null;
	if (nowMs - iat > STATE_TTL_MS) return null;
	if (nowMs + STATE_TTL_MS < iat) return null; // future-dated guard

	const expected = await hmacHex(`${orgId}.${nonce}.${iatStr}`);
	if (!constantTimeEqualHex(expected, sig)) return null;

	return { orgId };
}

function constantTimeEqualHex(a: string, b: string): boolean {
	if (!/^[0-9a-f]*$/i.test(a) || !/^[0-9a-f]*$/i.test(b)) return false;
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}
