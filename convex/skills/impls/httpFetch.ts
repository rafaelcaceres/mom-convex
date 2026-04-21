import { z } from "zod";
import { type SkillImpl, registerSkill } from "../_libs/skillImpls";

/**
 * Baseline `http.fetch` implementation (M2-T06).
 *
 * Exposed to the model as a read-only tool: given a URL and optional body it
 * performs a single HTTP(S) round-trip and returns status / headers / body to
 * the tool call. Gates before hitting the network:
 *
 *   1. Zod validates shape (`url`, `method`, `headers`, `body`).
 *   2. URL parse + protocol allowlist (http / https only).
 *   3. SSRF hostname blocklist for RFC1918, loopback, link-local and
 *      `localhost`. Dotted-quad literals only — DNS rebinding & IPv6 are
 *      tracked as follow-ups when we move this behind an outbound proxy.
 *   4. `AbortSignal.timeout(10_000)` merged with the caller signal so the
 *      dispatcher can still cancel early (e.g. action shutdown).
 *
 * 5xx is treated as a failure and thrown so the dispatcher's `formatImplError`
 * wraps it into the structured `{isError:true, content:[...]}` shape. 4xx is
 * returned as-is because "the server said no" is still a useful signal to the
 * model — it can adjust the next call without us deciding for it.
 */

const HttpFetchArgs = z.object({
	url: z.string().url(),
	method: z.enum(["GET", "POST"]).default("GET"),
	headers: z.record(z.string(), z.string()).optional(),
	body: z.string().optional(),
});

export type HttpFetchResult = {
	status: number;
	headers: Record<string, string>;
	body: string;
	truncated?: boolean;
	originalBodyBytes?: number;
};

/**
 * Hard cap on the response body we feed back into the model. A single HTML
 * page can trivially be hundreds of KB; at ~4 chars/token that blows through
 * Claude's 200k context window after only a few tool calls. 50_000 chars is
 * enough for most APIs and small HTML docs, and leaves headroom for long
 * conversations. Callers needing the full body should narrow their query
 * (query params, API endpoint) rather than increase this cap.
 */
const MAX_BODY_CHARS = 50_000;

const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);

function isBlockedHostname(hostname: string): boolean {
	const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
	if (BLOCKED_HOSTNAMES.has(h)) return true;
	if (h === "0.0.0.0") return true;
	if (h === "::1" || h === "::" || h === "0:0:0:0:0:0:0:1") return true;
	if (/^127\./.test(h)) return true;
	if (/^10\./.test(h)) return true;
	if (/^192\.168\./.test(h)) return true;
	if (/^169\.254\./.test(h)) return true;
	const m172 = h.match(/^172\.(\d{1,3})\./);
	if (m172) {
		const n = Number(m172[1]);
		if (n >= 16 && n <= 31) return true;
	}
	return false;
}

type AbortStatic = typeof AbortSignal & {
	any?: (signals: AbortSignal[]) => AbortSignal;
};

function mergeSignals(caller: AbortSignal, timeout: AbortSignal): AbortSignal {
	const anyFn = (AbortSignal as AbortStatic).any;
	if (anyFn) return anyFn.call(AbortSignal, [caller, timeout]);
	return timeout;
}

export const httpFetchImpl: SkillImpl = async (_ctx, input, options) => {
	const args = HttpFetchArgs.parse(input);

	const parsed = new URL(args.url);
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error(`http.fetch blocked protocol: ${parsed.protocol}`);
	}
	if (isBlockedHostname(parsed.hostname)) {
		throw new Error(`http.fetch SSRF guard: hostname '${parsed.hostname}' is blocked`);
	}

	const timeoutSignal = AbortSignal.timeout(10_000);
	const signal = mergeSignals(options.signal, timeoutSignal);

	let res: Response;
	try {
		res = await fetch(args.url, {
			method: args.method,
			headers: args.headers,
			body: args.body,
			signal,
		});
	} catch (err) {
		const name = (err as { name?: unknown })?.name;
		if (name === "TimeoutError" || name === "AbortError") {
			throw new Error(`http.fetch timed out after 10000ms for ${args.url}`);
		}
		throw err;
	}

	const rawBody = await res.text();
	if (res.status >= 500) {
		throw new Error(`http.fetch upstream error: HTTP ${res.status} from ${args.url}`);
	}

	const headers: Record<string, string> = {};
	res.headers.forEach((value, key) => {
		headers[key] = value;
	});

	if (rawBody.length > MAX_BODY_CHARS) {
		const truncatedBody = `${rawBody.slice(0, MAX_BODY_CHARS)}\n… [truncated: ${rawBody.length - MAX_BODY_CHARS} more chars]`;
		return {
			status: res.status,
			headers,
			body: truncatedBody,
			truncated: true,
			originalBodyBytes: rawBody.length,
		} satisfies HttpFetchResult;
	}

	return {
		status: res.status,
		headers,
		body: rawBody,
	} satisfies HttpFetchResult;
};

registerSkill("http.fetch", httpFetchImpl);
