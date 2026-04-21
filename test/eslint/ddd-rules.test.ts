import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Lazy-load ESLint to keep the infra test suite light.
async function lintFixture(relPathInTmp: string, content: string, projectRoot: string) {
	const { ESLint } = await import("eslint");
	const full = join(projectRoot, relPathInTmp);
	await mkdir(dirname(full), { recursive: true });
	await writeFile(full, content);
	const eslint = new ESLint({
		overrideConfigFile: resolve(process.cwd(), "eslint.config.mjs"),
		cwd: projectRoot,
	});
	const [result] = await eslint.lintFiles([full]);
	return result?.messages ?? [];
}

describe("M0-T04 DDD ESLint rules", () => {
	let projectRoot: string;

	beforeAll(async () => {
		projectRoot = await mkdtemp(join(tmpdir(), "ddd-rules-"));
	});

	afterAll(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("rule 1: blocks `mutation` imported from _generated/server outside customFunctions", async () => {
		const messages = await lintFixture(
			"convex/someDomain/mutations/bad.ts",
			`import { mutation } from "../../_generated/server";\nconst x = mutation({});\nexport default x;\n`,
			projectRoot,
		);
		const errors = messages.filter((m) => m.ruleId === "no-restricted-imports");
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]?.message).toMatch(/customFunctions/);
	});

	it("rule 1: allows the same import inside convex/customFunctions.ts", async () => {
		const messages = await lintFixture(
			"convex/customFunctions.ts",
			`import { mutation } from "./_generated/server";\nexport { mutation };\n`,
			projectRoot,
		);
		const errors = messages.filter((m) => m.ruleId === "no-restricted-imports");
		expect(errors).toHaveLength(0);
	});

	it("rule 2: blocks direct ctx.db.insert outside adapters/", async () => {
		const messages = await lintFixture(
			"convex/someDomain/domain/bad.ts",
			`async function handler(ctx: any) { return ctx.db.insert("t", {}); }\n`,
			projectRoot,
		);
		const errors = messages.filter((m) => m.ruleId === "no-restricted-syntax");
		expect(errors.some((e) => /ctx\.db\.insert/.test(e.message))).toBe(true);
	});

	it("rule 2: blocks direct ctx.db.query inside mutations/ (still must use repos)", async () => {
		const messages = await lintFixture(
			"convex/someDomain/mutations/bad.ts",
			`async function handler(ctx: any) { return ctx.db.query("t").collect(); }\n`,
			projectRoot,
		);
		const errors = messages.filter((m) => m.ruleId === "no-restricted-syntax");
		expect(errors.some((e) => /ctx\.db\.query/.test(e.message))).toBe(true);
	});

	it("rule 2: allows direct ctx.db.* inside adapters/", async () => {
		const messages = await lintFixture(
			"convex/someDomain/adapters/thing.repository.ts",
			`async function fn(ctx: any) { return ctx.db.query("t"); }\n`,
			projectRoot,
		);
		const errors = messages.filter((m) => m.ruleId === "no-restricted-syntax");
		expect(errors).toHaveLength(0);
	});

	it("rule 3: blocks mutation() call outside mutations/ folder", async () => {
		const messages = await lintFixture(
			"convex/someDomain/notMutations.ts",
			"declare const mutation: any;\nconst x = mutation({});\nexport default x;\n",
			projectRoot,
		);
		const errors = messages.filter((m) => m.ruleId === "no-restricted-syntax");
		expect(
			errors.some((e) => /Define mutations inside a `mutations\/` folder/.test(e.message)),
		).toBe(true);
	});

	it("rule 3: allows mutation() inside mutations/", async () => {
		const messages = await lintFixture(
			"convex/someDomain/mutations/good.ts",
			"declare const mutation: any;\nconst x = mutation({});\nexport default x;\n",
			projectRoot,
		);
		const errors = messages.filter(
			(m) => m.ruleId === "no-restricted-syntax" && /mutations\/ folder/.test(m.message ?? ""),
		);
		expect(errors).toHaveLength(0);
	});

	it("rule 4: blocks named export pattern in mutations/", async () => {
		const messages = await lintFixture(
			"convex/someDomain/mutations/badNamed.ts",
			"declare const mutation: any;\nexport const badNamed = mutation({});\n",
			projectRoot,
		);
		const errors = messages.filter((m) => m.ruleId === "no-restricted-syntax");
		expect(errors.some((e) => /export default/.test(e.message))).toBe(true);
	});
});
