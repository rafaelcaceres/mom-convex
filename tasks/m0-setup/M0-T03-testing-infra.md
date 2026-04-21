# [M0-T03] Vitest + convex-test + MSW + smoke harness

## Why
Sem infra de teste não há TDD. Toda task subsequente assume `vitest`, `convex-test` e MSW funcionando.

## Depends on
[M0-T01] scaffold

## Acceptance tests (write FIRST)
- `test/infra/convex-test.test.ts`
  - `convexTest(schema)` cria instance, roda 1 mutation dummy, query retorna o dado
- `test/infra/msw.test.ts`
  - MSW intercepta `fetch("https://example.test/api")` e responde mockado
- `test/smoke.test.ts` — arquivo dummy que será preenchido por cada smoke de milestone

## Implementation
- `vitest.config.ts` — `environment: "edge-runtime"` pra Convex runtime; `setupFiles: ["./test/setup.ts"]`
- `test/setup.ts` — inicia MSW server beforeAll, reset handlers afterEach, close afterAll
- `test/_helpers/convex.ts` — export `newTest()` wrapping `convexTest(schema, modules)`
- `test/_helpers/msw.ts` — export `server`, `http`, `HttpResponse` (re-exports)
- `package.json` scripts: `test`, `test:watch`, `test:smoke` (filter `test/smoke`)
- Faux LLM provider helper — `test/_helpers/fauxModel.ts` retorna `LanguageModelV1` scripted (mock com toolCalls/text por turno)

## Done when
- `pnpm test` verde com 3 suites dummy
- Possível rodar suite filtrada (`pnpm test skillCatalog`)
- Faux model pode ser injetado em `Agent({ chat: faux })`

## References
- [convex-test docs](https://docs.convex.dev/testing/convex-test)
- [MSW v2](https://mswjs.io/)
- [AI SDK test utils](https://ai-sdk.dev/docs/ai-sdk-core/testing)
