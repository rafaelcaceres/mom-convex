import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["test/**/*.test.ts", "convex/**/*.test.ts"],
		exclude: ["node_modules", ".next", "dist", "test/e2e/**"],
		setupFiles: ["./test/setup.ts"],
		server: {
			deps: {
				inline: ["convex-test"],
			},
		},
	},
});
