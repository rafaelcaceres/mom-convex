/**
 * Slack request signing verification.
 *
 * Slack signs every webhook (events, interactions, slash commands) with:
 *   base = "v0:" + X-Slack-Request-Timestamp + ":" + rawBody
 *   sig  = "v0=" + HMAC_SHA256_hex(SLACK_SIGNING_SECRET, base)
 *
 * We verify against a constant-time compare and enforce a ±5 min window on
 * the timestamp to block replay attacks. See:
 *   https://api.slack.com/authentication/verifying-requests-from-slack
 *
 * This function is pure. The caller (events httpAction) supplies `nowSec`
 * — defaulting to the current clock — so tests can pin time.
 */

const TOLERANCE_SEC = 5 * 60;

export interface VerifySlackSignatureArgs {
	timestamp: string;
	rawBody: string;
	signature: string;
	secret: string;
	nowSec?: number;
}

export async function verifySlackSignature(args: VerifySlackSignatureArgs): Promise<boolean> {
	const { timestamp, rawBody, signature, secret } = args;
	const nowSec = args.nowSec ?? Math.floor(Date.now() / 1000);

	if (!signature.startsWith("v0=")) return false;
	const ts = Number(timestamp);
	if (!Number.isFinite(ts) || Math.floor(ts) !== ts) return false;
	if (Math.abs(nowSec - ts) > TOLERANCE_SEC) return false;

	const expectedHex = await computeHmacHex(secret, `v0:${timestamp}:${rawBody}`);
	const receivedHex = signature.slice(3);

	return constantTimeEqualHex(expectedHex, receivedHex);
}

async function computeHmacHex(secret: string, message: string): Promise<string> {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		enc.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
	return bytesToHex(new Uint8Array(sig));
}

function bytesToHex(bytes: Uint8Array): string {
	let out = "";
	for (let i = 0; i < bytes.length; i++) {
		out += (bytes[i] as number).toString(16).padStart(2, "0");
	}
	return out;
}

/**
 * Constant-time compare of two hex strings. Mismatched lengths short-circuit
 * to false but still iterate the common prefix to keep timing uniform.
 */
function constantTimeEqualHex(a: string, b: string): boolean {
	// Reject obvious non-hex input before hex→bytes.
	if (!/^[0-9a-f]*$/i.test(a) || !/^[0-9a-f]*$/i.test(b)) return false;
	if (a.length !== b.length) return false;

	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}
