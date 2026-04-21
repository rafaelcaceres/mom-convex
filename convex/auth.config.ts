export default {
	providers: [
		{
			// Resolved at runtime by @convex-dev/auth. `CONVEX_SITE_URL` is the
			// public httpAction URL of the Convex deployment.
			domain: process.env.CONVEX_SITE_URL,
			applicationID: "convex",
		},
	],
};
