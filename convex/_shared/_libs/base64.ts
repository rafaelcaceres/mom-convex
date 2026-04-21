/**
 * Base64 helpers using web standards (`atob` / `btoa`) so the same code path
 * works in the Convex V8 runtime (no Node `Buffer`), the Node runtime, and
 * Convex actions / httpActions alike.
 *
 * Uses the explicit `ArrayBuffer` backing so `Uint8Array<ArrayBuffer>`
 * propagates correctly to WebCrypto APIs that reject `SharedArrayBuffer`.
 */

export function decodeBase64(b64: string): Uint8Array<ArrayBuffer> {
	const binary = atob(b64);
	const out = new Uint8Array(new ArrayBuffer(binary.length));
	for (let i = 0; i < binary.length; i++) {
		out[i] = binary.charCodeAt(i);
	}
	return out;
}

export function encodeBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		const slice = bytes.subarray(i, i + chunk);
		binary += String.fromCharCode(...slice);
	}
	return btoa(binary);
}
