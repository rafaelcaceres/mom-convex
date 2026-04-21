import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const root = join(__dirname, "..");
const readJson = (relPath: string) => JSON.parse(readFileSync(join(root, relPath), "utf8"));
const readText = (relPath: string) => readFileSync(join(root, relPath), "utf8");

describe("M0-T01 scaffold", () => {
	describe("tsconfig.json", () => {
		const tsconfig = readJson("tsconfig.json");

		it("has strict: true", () => {
			expect(tsconfig.compilerOptions?.strict).toBe(true);
		});

		it("has noUncheckedIndexedAccess: true", () => {
			expect(tsconfig.compilerOptions?.noUncheckedIndexedAccess).toBe(true);
		});
	});

	describe("package.json", () => {
		const pkg = readJson("package.json");

		it.each(["dev", "lint", "test", "test:smoke", "build"])("has script '%s'", (script) => {
			expect(pkg.scripts?.[script]).toBeDefined();
		});
	});

	describe(".gitignore", () => {
		const gitignore = readText(".gitignore");

		it("ignores convex/_generated/", () => {
			expect(gitignore).toMatch(/^_generated\/?$|convex\/_generated\/?$/m);
		});

		it("ignores node_modules", () => {
			expect(gitignore).toMatch(/^node_modules\/?$/m);
		});

		it("ignores .env*.local and .env", () => {
			expect(gitignore).toMatch(/\.env/);
		});
	});

	describe(".github/workflows/ci.yml", () => {
		const ciRaw = readText(".github/workflows/ci.yml");
		const ci = parseYaml(ciRaw) as {
			jobs?: Record<string, unknown>;
		};

		it("is valid YAML", () => {
			expect(ci).toBeTypeOf("object");
		});

		it.each(["lint", "unit", "e2e"])("has job '%s'", (jobName) => {
			expect(ci.jobs?.[jobName]).toBeDefined();
		});
	});
});
