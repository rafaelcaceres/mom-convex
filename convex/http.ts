import { httpRouter } from "convex/server";
import health from "./_shared/adapters/health.httpAction";
import { auth } from "./auth";
import slackEvents from "./slack/adapters/events.httpAction";
import slackOauthCallback from "./slack/adapters/oauthCallback.httpAction";

const http = httpRouter();

http.route({ path: "/health", method: "GET", handler: health });
http.route({ path: "/slack/oauth/callback", method: "GET", handler: slackOauthCallback });
http.route({ path: "/slack/events", method: "POST", handler: slackEvents });

// Registers /.well-known/openid-configuration, /api/auth/*, etc.
auth.addHttpRoutes(http);

export default http;
