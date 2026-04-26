import { ConvexError } from "convex/values";
import {
	type SlackUserListMember,
	type UsersListResult,
	usersList,
} from "./slackClient";

/**
 * Pure orchestration of `users.list` pagination. Walks `next_cursor` until
 * Slack returns an empty cursor or we hit the safety cap, returning a flat
 * list mapped to our domain shape. Filters out deleted users (Slack still
 * returns them with `deleted: true`).
 *
 * `fetchPage` is injectable so tests can stage page sequences without going
 * through `fetch`/MSW. The default uses the real `usersList` Web API.
 *
 * The hard page cap (default 50 = 10 000 users at limit 200) bounds worst-
 * case API spend on a runaway tenant; in practice no real workspace hits it.
 */

export interface FetchedUser {
	userId: string;
	username: string;
	displayName: string;
	isBot: boolean;
}

export interface UsersFetchPageFn {
	(args: { cursor?: string }): Promise<UsersListResult>;
}

const DEFAULT_PAGE_LIMIT = 200;
const DEFAULT_MAX_PAGES = 50;

export function mapMember(m: SlackUserListMember): FetchedUser {
	const display = m.profile?.display_name?.trim();
	const real = m.profile?.real_name?.trim();
	return {
		userId: m.id,
		username: m.name,
		displayName: display && display.length > 0 ? display : (real ?? m.name),
		isBot: m.is_bot ?? false,
	};
}

export async function fetchAllUsers(args: {
	fetchPage?: UsersFetchPageFn;
	botToken?: string;
	pageLimit?: number;
	maxPages?: number;
}): Promise<FetchedUser[]> {
	const fetchPage =
		args.fetchPage ??
		(({ cursor }) => {
			if (args.botToken === undefined) {
				throw new ConvexError({ code: "users_fetcher_missing_token" });
			}
			return usersList({
				botToken: args.botToken,
				cursor,
				limit: args.pageLimit ?? DEFAULT_PAGE_LIMIT,
			});
		});

	const maxPages = args.maxPages ?? DEFAULT_MAX_PAGES;
	const out: FetchedUser[] = [];
	let cursor: string | undefined;
	for (let page = 0; page < maxPages; page += 1) {
		const result = await fetchPage({ cursor });
		if (!result.ok) {
			throw new ConvexError({
				code: "users_list_failed",
				error: result.error,
			});
		}
		for (const member of result.members) {
			if (member.deleted) continue;
			out.push(mapMember(member));
		}
		cursor = result.response_metadata?.next_cursor;
		if (!cursor || cursor.length === 0) return out;
	}
	throw new ConvexError({ code: "users_list_too_many_pages", maxPages });
}
