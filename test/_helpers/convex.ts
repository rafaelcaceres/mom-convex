import agentTest from "@convex-dev/agent/test";
import authzTest from "@djpanda/convex-authz/test";
import tenantsTest from "@djpanda/convex-tenants/test";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";

/**
 * Factory for `convex-test` instances pre-wired to this project's schema.
 *
 * Registers the tenants + authz components so tests can exercise the real
 * SDK methods (e.g. `tenants.createOrganization`). `import.meta.glob` is a
 * Vite compile-time transform — keep the call literal or Vite won't rewrite it.
 *
 * The `ImportMeta.glob` type comes from `vite/client` transitively via
 * `@djpanda/convex-{tenants,authz}/test`, so no local declaration needed.
 */
export function newTest() {
	const modules = import.meta.glob("../../convex/**/!(*.test).ts") as Record<
		string,
		() => Promise<unknown>
	>;
	const t = convexTest(schema, modules);
	tenantsTest.register(t, "tenants");
	authzTest.register(t, "authz");
	agentTest.register(t, "agent");
	return t;
}
