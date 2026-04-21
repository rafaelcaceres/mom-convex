/**
 * Minimal Slack Web API client. Uses `fetch` directly so MSW can intercept
 * calls in tests without touching the `@slack/web-api` SDK. All endpoints
 * we actually hit in M1 fit comfortably here.
 */

export interface SlackOAuthAccessOk {
	ok: true;
	access_token: string;
	scope: string;
	bot_user_id: string;
	team: { id: string; name: string };
}

export interface SlackApiError {
	ok: false;
	error: string;
}

export type SlackOAuthAccessResult = SlackOAuthAccessOk | SlackApiError;

/**
 * POST oauth.v2.access — exchange an authorization code for a bot token.
 * See https://api.slack.com/methods/oauth.v2.access.
 */
export async function exchangeOAuthCode(args: {
	clientId: string;
	clientSecret: string;
	code: string;
	redirectUri: string;
	fetchImpl?: typeof fetch;
}): Promise<SlackOAuthAccessResult> {
	const body = new URLSearchParams({
		client_id: args.clientId,
		client_secret: args.clientSecret,
		code: args.code,
		redirect_uri: args.redirectUri,
	});
	const doFetch = args.fetchImpl ?? fetch;
	const res = await doFetch("https://slack.com/api/oauth.v2.access", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: body.toString(),
	});
	return (await res.json()) as SlackOAuthAccessResult;
}

/**
 * Build the Slack OAuth authorize URL for the install-start step.
 * Caller supplies the signed `state` from `oauthState.ts`.
 */
export function buildInstallUrl(args: {
	clientId: string;
	scope: string;
	state: string;
	redirectUri: string;
}): string {
	const params = new URLSearchParams({
		client_id: args.clientId,
		scope: args.scope,
		state: args.state,
		redirect_uri: args.redirectUri,
	});
	return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

export interface ChatPostMessageOk {
	ok: true;
	channel: string;
	ts: string;
}

export type ChatPostMessageResult = ChatPostMessageOk | SlackApiError;

export interface ChatPostMessageResponse {
	result: ChatPostMessageResult;
	/** HTTP status. 429 surfaces separately so callers can honour retry-after. */
	status: number;
	/** `Retry-After` header in seconds (only set for 429). */
	retryAfterSec?: number;
}

/**
 * POST chat.postMessage. Thin wrapper — callers own retry + token-decrypt.
 * See https://api.slack.com/methods/chat.postMessage.
 */
export async function chatPostMessage(args: {
	botToken: string;
	channel: string;
	text: string;
	threadTs?: string;
	fetchImpl?: typeof fetch;
}): Promise<ChatPostMessageResponse> {
	const doFetch = args.fetchImpl ?? fetch;
	const payload: Record<string, unknown> = {
		channel: args.channel,
		text: args.text,
	};
	if (args.threadTs) payload.thread_ts = args.threadTs;
	const res = await doFetch("https://slack.com/api/chat.postMessage", {
		method: "POST",
		headers: {
			"content-type": "application/json; charset=utf-8",
			authorization: `Bearer ${args.botToken}`,
		},
		body: JSON.stringify(payload),
	});
	const retryAfter = res.headers.get("retry-after");
	const retryAfterSec = retryAfter ? Number(retryAfter) : undefined;
	const json = (await res.json()) as ChatPostMessageResult;
	return {
		result: json,
		status: res.status,
		retryAfterSec: Number.isFinite(retryAfterSec) ? retryAfterSec : undefined,
	};
}

export interface AuthRevokeOk {
	ok: true;
	revoked: boolean;
}

export type AuthRevokeResult = AuthRevokeOk | SlackApiError;

/**
 * POST auth.revoke — invalidate a bot token. Called from the uninstall flow
 * so the token can't be used after the row is deleted. Slack returns
 * `{ ok: true, revoked: true }` on success.
 * See https://api.slack.com/methods/auth.revoke.
 */
export async function authRevoke(args: {
	botToken: string;
	fetchImpl?: typeof fetch;
}): Promise<AuthRevokeResult> {
	const doFetch = args.fetchImpl ?? fetch;
	const res = await doFetch("https://slack.com/api/auth.revoke", {
		method: "POST",
		headers: { authorization: `Bearer ${args.botToken}` },
	});
	return (await res.json()) as AuthRevokeResult;
}

/** Scope baseline for M1 — app_mentions + message history + posting. */
export const SLACK_DEFAULT_BOT_SCOPES = [
	"app_mentions:read",
	"channels:history",
	"groups:history",
	"im:history",
	"mpim:history",
	"chat:write",
	"users:read",
].join(",");
