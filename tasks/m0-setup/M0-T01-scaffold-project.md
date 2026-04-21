# [M0-T01] Scaffold Next.js 15 + Convex + pnpm + Biome + CI

## Why
Base do projeto. Sem isso nenhuma outra task roda. Decisão de repo: **single package** na raiz de `mom-convex/`.

## Depends on
Nenhuma.

## Acceptance tests (write FIRST)
- `test/scaffold.test.ts`
  - `tsconfig.json` tem `strict: true` e `noUncheckedIndexedAccess: true`
  - `package.json` tem scripts `dev`, `lint`, `test`, `test:smoke`, `build`
  - `convex/_generated/` é ignorado pelo git
- CI workflow `.github/workflows/ci.yml` existe com jobs: `lint`, `unit`, `e2e` (playwright). Validado apenas por existência + yaml válido (teste com `yaml.parse`).

## Implementation
- `package.json` — deps: `next@15`, `react@19`, `convex`, `convex-helpers`; devDeps: `typescript`, `@biomejs/biome`, `vitest`, `convex-test`, `@playwright/test`, `@types/node`
- `tsconfig.json` — strict + paths `@/*` → `./*`
- `next.config.mjs`
- `biome.json` — formatter + linter básico (DDD rules vêm em M0-T04)
- `app/layout.tsx`, `app/page.tsx` — Hello world
- `convex/` — `pnpm dlx convex dev` rodado uma vez pra gerar `_generated/`
- `.gitignore`, `.env.example` (`CONVEX_DEPLOYMENT`, `CONVEX_URL`, `CONVEX_SITE_URL`, `NEXT_PUBLIC_CONVEX_URL`)
- `.github/workflows/ci.yml` — node 20, pnpm cache, `playwright install --with-deps chromium` no e2e job
- `README.md` (raiz) — comandos: `pnpm dev`, `pnpm test`, `pnpm convex dev`

## Done when
- `pnpm install && pnpm dev` sobe Next + Convex simultaneamente (via `concurrently` ou 2 terminais)
- `pnpm test` roda vitest vazio com 1 assert dummy
- CI verde em PR draft

## References
- [Plano §Repo layout alvo](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
- [Convex quickstart Next.js](https://docs.convex.dev/quickstart/nextjs)
