# [M2-T06] Skill `http.fetch` — baseline read-only

## Why
Skill mais simples possível pra validar o pipeline: args Zod → resolveTools → invoke → result. Também útil de fato (buscar URL).

## Depends on
[M2-T05] skills.invoke

## Acceptance tests (write FIRST)
- `convex/skills/impls/httpFetch.test.ts`
  - `GET https://example.test` (MSW) → retorna texto com status/headers
  - `POST` com body JSON → retorna response body
  - timeout 10s → retorna erro estruturado sem hang
  - 5xx → retorna status no content, isError=true
  - URL com hostname private (10.x, 127.x) → bloqueado (SSRF guard)
- Integration: agent com `http.fetch` habilitada recebe prompt "fetch https://example.test" e chama tool

## Implementation
- `convex/skills/impls/httpFetch.ts`
  - Zod: `{url: z.string().url(), method: z.enum(["GET","POST"]).default("GET"), headers?: z.record(z.string()), body?: z.string()}`
  - SSRF guard: parsear URL, bloquear `10.*`, `127.*`, `192.168.*`, `169.254.*`, `localhost`
  - Timeout via `AbortSignal.timeout(10_000)`
  - Registrar em `skillImpls` map
- `convex/skills/_seeds.ts` — adicionar `http.fetch` ao catálogo

## Done when
- Tests verdes
- Dashboard: default agent tem `http.fetch` habilitada após M2-T03 seed

## References
- [Plano §Bootstrap MVP](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
