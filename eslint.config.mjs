import tseslint from "typescript-eslint";

// Rule detail: see ~/.claude/skills/convex-ddd-architecture/eslint-rules.md
//
// IMPORTANT: ESLint flat config does NOT merge `no-restricted-syntax` values
// across blocks — a later block's rule value fully replaces an earlier one.
// To keep distinct concerns enforceable, we assemble a single selector set and
// apply it to two non-overlapping file groups below.

const ctxDbSelectors = ["insert", "patch", "replace", "delete", "query", "get"].map((method) => ({
	selector: `CallExpression[callee.object.object.name='ctx'][callee.object.property.name='db'][callee.property.name='${method}']`,
	message: `Direct ctx.db.${method} is not allowed outside repository adapters. Use a repository and work with aggregates.`,
}));

const mutationCallSelectors = [
	{
		selector: "CallExpression[callee.name='mutation']",
		message:
			"Define mutations inside a `mutations/` folder. The filename should match the mutation name.",
	},
	{
		selector: "CallExpression[callee.name='internalMutation']",
		message:
			"Define internal mutations inside a `mutations/` folder. The filename should match the mutation name.",
	},
];

const namedExportSelector = {
	selector:
		"ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > CallExpression[callee.name=/^(mutation|query|internalMutation|internalQuery)$/]",
	message:
		"Use `const name = mutation({...}); export default name;` instead of `export const name = mutation({...})`.",
};

export default tseslint.config(
	{
		ignores: [
			"node_modules",
			".next",
			"dist",
			"convex/_generated/**",
			"coverage",
			"playwright-report",
			"test-results",
			"docs",
			"tasks",
			".agents",
			".claude",
		],
	},

	// Base TS parser for all .ts files
	{
		files: ["**/*.ts", "**/*.tsx"],
		languageOptions: { parser: tseslint.parser },
	},

	// Rule 1: Custom function imports — block raw imports from _generated/server
	{
		files: ["convex/**/*.ts"],
		ignores: ["convex/customFunctions.ts"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							allowTypeImports: true,
							group: ["**/_generated/server"],
							importNames: [
								"mutation",
								"query",
								"action",
								"internalMutation",
								"internalQuery",
								"internalAction",
							],
							message:
								"Use custom functions from '../customFunctions' (or appropriate relative path) instead of '_generated/server'.",
						},
					],
				},
			],
		},
	},

	// Rules 2 + 3 (merged): ctx.db + mutation() calls banned outside adapters/mutations.
	// Applies to domain/queries/other-convex code. Adapters and mutations/queries are
	// handled by the other blocks (or exempted entirely).
	{
		files: ["convex/**/*.ts"],
		ignores: [
			"convex/**/adapters/**/*.ts",
			"convex/**/mutations/**/*.ts",
			"convex/**/queries/**/*.ts",
			"convex/_generated/**",
			"convex/customFunctions.ts",
			"convex/_triggers.ts",
			"convex/**/_triggers.ts",
			// Base repository factory IS the abstraction — must use ctx.db directly.
			"convex/_shared/_libs/repository.ts",
			// Tests may poke at internals directly.
			"convex/**/*.test.ts",
		],
		rules: {
			"no-restricted-syntax": ["error", ...ctxDbSelectors, ...mutationCallSelectors],
		},
	},

	// Rules 2 + 4 (merged): inside mutations/ and queries/, ctx.db is still banned
	// (use repositories), and named-export pattern is banned (use `export default`).
	// mutation() calls are allowed here (that's the whole point of this folder).
	{
		files: ["convex/**/mutations/**/*.ts", "convex/**/queries/**/*.ts"],
		ignores: ["convex/_generated/**", "convex/**/*.test.ts"],
		rules: {
			"no-restricted-syntax": ["error", ...ctxDbSelectors, namedExportSelector],
		},
	},
);
