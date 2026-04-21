# [M3-T05] Cross-tenant isolation — gate de segurança

**Revisão 2026-04-18**: em vez de testar namespace do `@convex-dev/rag`, testa **filter `orgId` no `vectorSearch` nativo** + isolamento do `fetchContextMessages` (que recebe `userId` encodado com orgId). Mesmo rigor (3 orgs, 20 asserts), lógica diferente.

---

_Conteúdo original:_

# [M3-T05-orig] Cross-tenant RAG isolation — gate de segurança

## Why
Multi-tenant RAG tem histórico de bugs (namespace typo vaza dados). Este teste é o gate: se quebrar, merge bloqueado. **Crítico pra SaaS.**

## Depends on
[M3-T04] real memory.search

## Acceptance tests (write FIRST)
- `test/smoke/rag-isolation.test.ts`
  - Setup: 3 orgs (A, B, C) com 50 memories + 100 mensagens cada
  - **20 asserts**:
    - search em A com query generic ("python") → só doc IDs de A (via metadata.orgId assertion)
    - search com query específica de B ("segredo-B") em namespace A → 0 results
    - same pra C vs A, C vs B
    - insert em A enquanto search em B roda → não interfere
    - delete em A → search em A drop, B intacto
    - Direct `rag.search` com namespace `org_B` chamado em ctx de org A (simulate bug) → authz bloqueia via helper
  - Assertion agregada: nenhum `docId.metadata.orgId !== currentOrgId` em qualquer response
- CI: suite marcada como `critical`; falha bloqueia merge

## Implementation
- `test/smoke/rag-isolation.test.ts` — configura fixtures e roda 20 cenários
- `convex/rag/_libs/client.ts` — hardened: helper `ragFor(ctx)` sempre deriva namespace de `ctx.auth.getUserIdentity() → membership → orgId`; nunca aceita namespace explícito do caller
- Audit log em cada search (quem, qual namespace, quantos results) — facilita investigar bugs

## Done when
- 20 asserts verdes
- Marcado em CI como job obrigatório
- Playbook no README: "se falhar, não merge até review humano"

## References
- [Plano §RAG isolation](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
- [Plano §Risks — Multi-tenant leak via RAG](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
