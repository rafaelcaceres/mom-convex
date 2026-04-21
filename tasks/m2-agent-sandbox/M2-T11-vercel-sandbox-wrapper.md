# [M2-T11] Vercel Sandbox wrapper — getOrCreate / resume / destroy

## Why
Cliente tipado do Vercel Sandbox (Firecracker microVM). Persistent mode auto-stopa em idle; nós só reabrimos. Isola a dependência em 1 módulo pra trocar provider depois.

## Depends on
[M2-T10] sandboxes repo

## Acceptance tests (write FIRST)
- `convex/sandbox/_libs/vercel.test.ts` (unit com mock do client)
  - `getOrCreate(threadId)` cria novo se não existe
  - `getOrCreate` com sandbox existente ativo → reconnect (não cria novo)
  - `getOrCreate` com status=destroyed → cria novo
  - `resume(persistentId)` chama client.resume
  - `destroy(id)` marca no DB + client.stop
  - tags incluem `orgId` e `threadId`
- `convex/sandbox/_libs/vercel.live.test.ts` (integration, `skip.if(!process.env.LIVE_VERCEL)`)
  - ciclo create→exec `echo hi`→destroy com token real

## Implementation
- `convex/sandbox/_libs/vercel.ts` — wrapper sobre `@vercel/sandbox`
- Interface `ISandboxClient` exposta pra M2-T12 tools (mockable)
- `.env.example` — `VERCEL_SANDBOX_TOKEN`, `VERCEL_TEAM_ID`
- Snapshotting (playwright+chromium) fica pra M3 (task futura); em M2, on-demand install

## Done when
- Unit tests verdes com mock
- Integration live test documentado como opt-in

## References
- [Vercel Sandbox docs](https://vercel.com/docs/sandbox)
- [Plano §Sandbox](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
