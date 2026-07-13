import agent from "@convex-dev/agent/convex.config";
import crons from "@convex-dev/crons/convex.config";
import authz from "@djpanda/convex-authz/convex.config";
import tenants from "@djpanda/convex-tenants/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(authz);
app.use(tenants);
app.use(agent);
// Dynamic (runtime-registered) crons for user-created periodic events (M4-T03).
// Static infra jobs stay in crons.ts (native cronJobs()).
app.use(crons);

export default app;
