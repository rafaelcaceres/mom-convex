import type { IRepository } from "../../_shared/_libs/repository";
import type { UserAgg } from "./user.model";

/**
 * Read access to the auth-owned `users` table. Only `get` is meaningful here —
 * writes are auth's responsibility, so callers should never `save`/`create`/
 * `delete` through this repo (the base methods exist but are intentionally
 * unused for this table).
 */
export interface IUserRepository extends IRepository<"users", UserAgg> {}
