/**
 * Runtime guard for skill args that look destructive regardless of the
 * catalog's declared `sideEffect`. The catalog is authoritative for *intent*
 * (e.g. `sandbox.bash` is declared `write`), but a skill declared `read`
 * can still be fed a write-shaped payload — `http.fetch` with a bash body,
 * a "read a file" skill with a `;rm -rf /` suffix in the path, etc.
 *
 * Any positive match routes the call to the confirmation branch in
 * `skills.invoke` (M2-T05), which short-circuits execution and returns a
 * preview. Real human-in-loop wiring lands in M3-T11.
 *
 * Patterns are coarse on purpose — false positives are cheap (one extra
 * confirmation) and false negatives are expensive (unauthorized write).
 */

const DANGEROUS_PATTERNS: readonly RegExp[] = [
	/\brm\s+-rf?\b/i,
	/\bsudo\b/i,
	/\bcurl\b.*\|\s*(?:sh|bash|zsh)\b/i,
	/\bwget\b.*\|\s*(?:sh|bash|zsh)\b/i,
	/\bmkfs(?:\.|\b)/i,
	/\bdd\s+if=.*\s+of=\/dev\//i,
	/:\(\)\s*\{\s*:\|:&\s*\};:/, // fork bomb
];

function coerceToScannable(value: unknown): string {
	if (value == null) return "";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return "";
	try {
		return JSON.stringify(value);
	} catch {
		return "";
	}
}

export function hasDangerousArgPattern(args: unknown): boolean {
	const text = coerceToScannable(args);
	if (!text) return false;
	return DANGEROUS_PATTERNS.some((p) => p.test(text));
}
