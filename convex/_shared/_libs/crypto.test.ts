import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decrypt, encrypt, generateMasterKeyBase64 } from "./crypto";

const ORIGINAL_KEY = process.env.CREDS_MASTER_KEY;

describe("M0-T06 crypto (AES-GCM via WebCrypto)", () => {
	beforeEach(() => {
		process.env.CREDS_MASTER_KEY = generateMasterKeyBase64();
	});

	afterEach(() => {
		if (ORIGINAL_KEY === undefined) {
			// biome-ignore lint/performance/noDelete: unsetting env for test isolation
			delete process.env.CREDS_MASTER_KEY;
		} else {
			process.env.CREDS_MASTER_KEY = ORIGINAL_KEY;
		}
	});

	it("encrypt returns { ciphertextB64, nonceB64, kid }", async () => {
		const result = await encrypt("hello");
		expect(result.ciphertextB64).toBeTypeOf("string");
		expect(result.nonceB64).toBeTypeOf("string");
		expect(result.kid).toBe("v1");
	});

	it("decrypt recovers plaintext", async () => {
		const plaintext = "secret bot token xoxb-...";
		const enc = await encrypt(plaintext);
		const got = await decrypt(enc);
		expect(got).toBe(plaintext);
	});

	it("ciphertext does not contain plaintext", async () => {
		const enc = await encrypt("sensitive-marker-12345");
		expect(enc.ciphertextB64).not.toContain("sensitive-marker-12345");
	});

	it("two encrypts of same plaintext produce different ciphertexts (random nonce)", async () => {
		const a = await encrypt("same-input");
		const b = await encrypt("same-input");
		expect(a.nonceB64).not.toBe(b.nonceB64);
		expect(a.ciphertextB64).not.toBe(b.ciphertextB64);
	});

	it("decrypt with tampered nonce rejects", async () => {
		const enc = await encrypt("data");
		const tamperedNonce = Buffer.from(enc.nonceB64, "base64");
		tamperedNonce[0] = (tamperedNonce[0] ?? 0) ^ 0xff;
		const tampered = { ...enc, nonceB64: tamperedNonce.toString("base64") };
		await expect(decrypt(tampered)).rejects.toThrow();
	});

	it("decrypt with tampered ciphertext rejects", async () => {
		const enc = await encrypt("data");
		const tamperedCt = Buffer.from(enc.ciphertextB64, "base64");
		tamperedCt[0] = (tamperedCt[0] ?? 0) ^ 0xff;
		const tampered = { ...enc, ciphertextB64: tamperedCt.toString("base64") };
		await expect(decrypt(tampered)).rejects.toThrow();
	});

	it("throws informative error when CREDS_MASTER_KEY is missing", async () => {
		// biome-ignore lint/performance/noDelete: unsetting env for test isolation
		delete process.env.CREDS_MASTER_KEY;
		await expect(encrypt("x")).rejects.toThrow(/CREDS_MASTER_KEY/);
	});

	it("throws when CREDS_MASTER_KEY is not 32 bytes", async () => {
		process.env.CREDS_MASTER_KEY = Buffer.from("too-short").toString("base64");
		await expect(encrypt("x")).rejects.toThrow(/32 bytes/);
	});

	it("throws when kid is unknown during decrypt", async () => {
		const enc = await encrypt("data");
		const wrongKid = { ...enc, kid: "v999" };
		await expect(decrypt(wrongKid)).rejects.toThrow(/kid/);
	});
});
