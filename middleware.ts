import {
	convexAuthNextjsMiddleware,
	createRouteMatcher,
	nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

// Routes that can be viewed without signing in.
const isPublicRoute = createRouteMatcher(["/", "/api/(.*)"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
	if (isPublicRoute(request)) return;
	if (!(await convexAuth.isAuthenticated())) {
		return nextjsMiddlewareRedirect(request, "/");
	}
});

export const config = {
	// Skip Next.js static files + image optimization.
	matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
