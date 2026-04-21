import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import type { IRepository } from "../../_shared/_libs/repository";
import type { Thread, ThreadAgg } from "./thread.model";

export interface IThreadRepository extends IRepository<"threads", ThreadAgg> {
	getByOrgBinding(
		ctx: QueryCtx,
		clause: { orgId: Thread["orgId"]; bindingKey: Thread["bindingKey"] },
	): Promise<ThreadAgg | null>;

	listByAgent(ctx: QueryCtx, clause: { agentId: Id<"agents"> }): Promise<ThreadAgg[]>;

	listByOrg(ctx: QueryCtx, clause: { orgId: Thread["orgId"] }): Promise<ThreadAgg[]>;
}
