import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySlackSignature } from "./verifySignature";

const SECRET = "slack_test_signing_secret";

function sign(timestamp: string, rawBody: string, secret = SECRET): string {
	const base = `v0:${timestamp}:${rawBody}`;
	return `v0=${createHmac("sha256", secret).update(base).digest("hex")}`;
}

const NOW_SEC = 1_700_000_000;

describe("M1-T06 verifySlackSignature", () => {
	it("returns true for a valid signature within tolerance", async () => {
		const timestamp = `${NOW_SEC}`;
		const rawBody = `{"type":"event_callback"}`;
		const signature = sign(timestamp, rawBody);

		const ok = await verifySlackSignature({
			timestamp,
			rawBody,
			signature,
			secret: SECRET,
			nowSec: NOW_SEC,
		});
		expect(ok).toBe(true);
	});

	it("returns false when the signature bytes are wrong", async () => {
		const timestamp = `${NOW_SEC}`;
		const rawBody = `{"type":"event_callback"}`;
		const signature = sign(timestamp, rawBody).replace(/.$/, "0");

		const ok = await verifySlackSignature({
			timestamp,
			rawBody,
			signature,
			secret: SECRET,
			nowSec: NOW_SEC,
		});
		expect(ok).toBe(false);
	});

	it("returns false when the secret doesn't match", async () => {
		const timestamp = `${NOW_SEC}`;
		const rawBody = `{"type":"event_callback"}`;
		const signature = sign(timestamp, rawBody, "wrong_secret");

		const ok = await verifySlackSignature({
			timestamp,
			rawBody,
			signature,
			secret: SECRET,
			nowSec: NOW_SEC,
		});
		expect(ok).toBe(false);
	});

	it("returns false when the timestamp is > 5 minutes old (replay guard)", async () => {
		const oldTs = `${NOW_SEC - 6 * 60}`;
		const rawBody = "{}";
		const signature = sign(oldTs, rawBody);

		const ok = await verifySlackSignature({
			timestamp: oldTs,
			rawBody,
			signature,
			secret: SECRET,
			nowSec: NOW_SEC,
		});
		expect(ok).toBe(false);
	});

	it("returns false when the timestamp is > 5 minutes in the future (clock skew guard)", async () => {
		const futureTs = `${NOW_SEC + 6 * 60}`;
		const rawBody = "{}";
		const signature = sign(futureTs, rawBody);

		const ok = await verifySlackSignature({
			timestamp: futureTs,
			rawBody,
			signature,
			secret: SECRET,
			nowSec: NOW_SEC,
		});
		expect(ok).toBe(false);
	});

	it("returns false when the signature is missing the 'v0=' prefix", async () => {
		const timestamp = `${NOW_SEC}`;
		const rawBody = "{}";
		const signature = sign(timestamp, rawBody).slice(3); // strip 'v0='

		const ok = await verifySlackSignature({
			timestamp,
			rawBody,
			signature,
			secret: SECRET,
			nowSec: NOW_SEC,
		});
		expect(ok).toBe(false);
	});

	it("returns false for malformed (non-hex) signatures without throwing", async () => {
		const timestamp = `${NOW_SEC}`;
		const rawBody = "{}";

		const ok = await verifySlackSignature({
			timestamp,
			rawBody,
			signature: "v0=zzz",
			secret: SECRET,
			nowSec: NOW_SEC,
		});
		expect(ok).toBe(false);
	});

	it("returns false when timestamp is not a valid integer", async () => {
		const ok = await verifySlackSignature({
			timestamp: "not-a-number",
			rawBody: "{}",
			signature: "v0=abc",
			secret: SECRET,
			nowSec: NOW_SEC,
		});
		expect(ok).toBe(false);
	});
});
