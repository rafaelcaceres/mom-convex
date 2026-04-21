import type { QueryCtx } from "../../_generated/server";
import type { IRepository } from "../../_shared/_libs/repository";
import type { Agent, AgentAgg } from "./agent.model";

export interface IAgentRepository extends IRepository<"agents", AgentAgg> {
	byOrgSlug(
		ctx: QueryCtx,
		clause: { orgId: Agent["orgId"]; slug: Agent["slug"] },
	): Promise<AgentAgg | null>;

	listByOrg(ctx: QueryCtx, clause: { orgId: Agent["orgId"] }): Promise<AgentAgg[]>;

	findDefault(ctx: QueryCtx, clause: { orgId: Agent["orgId"] }): Promise<AgentAgg | null>;
}
