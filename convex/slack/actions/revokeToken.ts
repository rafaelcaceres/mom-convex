import { v } from "convex/values";
import { internalAction } from "../../customFunctions";
import { authRevoke } from "../_libs/slackClient";

/**
 * Fire-and-forget Slack `auth.revoke`. Scheduled by the `uninstall` mutation
 * after the row is already deleted. Errors are logged but not rethrown — the
 * token is already orphaned from our side, and retrying a revoke for a
 * token we no longer store buys nothing. `token_revoked` / `invalid_auth`
 * responses are treated as success (Slack already invalidated it).
 */
const revokeToken = internalAction({
	args: { botToken: v.string() },
	returns: v.null(),
	handler: async (_ctx, args) => {
		try {
			const result = await authRevoke({ botToken: args.botToken });
			if (!result.ok && result.error !== "token_revoked" && result.error !== "invalid_auth") {
				console.warn(`slack auth.revoke failed: ${result.error}`);
			}
		} catch (err) {
			console.warn("slack auth.revoke threw", err);
		}
		return null;
	},
});

export default revokeToken;
