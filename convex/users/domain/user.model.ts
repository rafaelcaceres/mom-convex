import { type Infer, v } from "convex/values";
import type { IAggregate } from "../../_shared/_libs/aggregate";

/**
 * Read-only view over the auth-managed `users` table (provided by
 * `@convex-dev/auth`'s `authTables`). This domain does NOT own the table —
 * it neither defines it in a `_tables.ts` nor writes to it; auth controls the
 * lifecycle. The model exists only so other domains can resolve a web
 * `Id<"users">` (e.g. a chat `senderId`) into a human-readable profile through
 * a repository, instead of reaching into `ctx.db` directly (ESLint-enforced).
 *
 * All identity fields are optional because auth populates them lazily
 * (anonymous users have no name/email; OAuth users may omit phone, etc.).
 */

export const UserModel = v.object({
	_id: v.id("users"),
	_creationTime: v.number(),
	name: v.optional(v.string()),
	email: v.optional(v.string()),
	image: v.optional(v.string()),
	isAnonymous: v.optional(v.boolean()),
	phone: v.optional(v.string()),
	emailVerificationTime: v.optional(v.number()),
	phoneVerificationTime: v.optional(v.number()),
});

export type User = Infer<typeof UserModel>;

export class UserAgg implements IAggregate<User> {
	constructor(private readonly user: User) {}

	getModel(): User {
		return this.user;
	}

	/**
	 * Best-effort human label for prompts/UI: real name → email → fallback.
	 * Never returns an empty string so callers can render it verbatim.
	 */
	displayName(): string {
		const name = this.user.name?.trim();
		if (name) return name;
		const email = this.user.email?.trim();
		if (email) return email;
		return "Usuário";
	}
}
