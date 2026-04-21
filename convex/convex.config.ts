import agent from "@convex-dev/agent/convex.config";
import authz from "@djpanda/convex-authz/convex.config";
import tenants from "@djpanda/convex-tenants/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(authz);
app.use(tenants);
app.use(agent);

export default app;
