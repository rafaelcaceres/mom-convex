import { createRepository } from "../../_shared/_libs/repository";
import { UserAgg } from "../domain/user.model";
import type { IUserRepository } from "../domain/user.repository";

/**
 * Adapter over the auth-managed `users` table. The base `createRepository`
 * factory is the only place allowed to touch `ctx.db` for this table; query
 * code resolves a web user via `UserRepository.get(ctx, userId)`.
 */
export const UserRepository: IUserRepository = {
	...createRepository("users", (doc) => new UserAgg(doc)),
};
