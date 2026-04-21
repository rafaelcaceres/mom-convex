/**
 * AES-256-GCM via WebCrypto. Works in Node 20+ and Convex runtime.
 *
 * Design decision (M0-T06): WebCrypto chosen over libsodium to avoid native
 * deps and keep the same code path in Node/Edge/Convex. `kid` field is present
 * so we can rotate keys later without breaking existing ciphertexts.
 */

import { decodeBase64, encodeBase64 } from "./base64";

const KEY_LENGTH_BYTES = 32;
const NONCE_LENGTH_BYTES = 12;
const CURRENT_KID = "v1";

export interface Encrypted {
	ciphertextB64: string;
	nonceB64: string;
	kid: string;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(new ArrayBuffer(length));
	crypto.getRandomValues(out);
	return out;
}

function utf8Encode(s: string): Uint8Array<ArrayBuffer> {
	const encoded = new TextEncoder().encode(s);
	const out = new Uint8Array(new ArrayBuffer(encoded.byteLength));
	out.set(encoded);
	return out;
}

function loadMasterKeyBytes(kid: string): Uint8Array<ArrayBuffer> {
	if (kid !== CURRENT_KID) {
		throw new Error(`Unknown kid '${kid}'. Only '${CURRENT_KID}' is supported.`);
	}
	const raw = process.env.CREDS_MASTER_KEY;
	if (!raw) {
		throw new Error(
			"CREDS_MASTER_KEY is not set. Generate one with: node -e \"console.log(require('node:crypto').randomBytes(32).toString('base64'))\"",
		);
	}
	const bytes = decodeBase64(raw);
	if (bytes.length !== KEY_LENGTH_BYTES) {
		throw new Error(
			`CREDS_MASTER_KEY must decode to ${KEY_LENGTH_BYTES} bytes, got ${bytes.length}`,
		);
	}
	return bytes;
}

async function importKey(kid: string): Promise<CryptoKey> {
	const rawKey = loadMasterKeyBytes(kid);
	return crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encrypt(plaintext: string): Promise<Encrypted> {
	const key = await importKey(CURRENT_KID);
	const nonce = randomBytes(NONCE_LENGTH_BYTES);
	const data = utf8Encode(plaintext);
	const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, data);
	return {
		ciphertextB64: encodeBase64(new Uint8Array(ciphertext)),
		nonceB64: encodeBase64(nonce),
		kid: CURRENT_KID,
	};
}

export async function decrypt(enc: Encrypted): Promise<string> {
	const key = await importKey(enc.kid);
	const nonce = decodeBase64(enc.nonceB64);
	const ciphertext = decodeBase64(enc.ciphertextB64);
	const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ciphertext);
	return new TextDecoder().decode(plain);
}

/** Helper for tests and CLI usage. Not exported from index. */
export function generateMasterKeyBase64(): string {
	return encodeBase64(randomBytes(KEY_LENGTH_BYTES));
}
