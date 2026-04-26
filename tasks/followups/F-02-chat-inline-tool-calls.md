# [F-02] Chat com tool calls colapsáveis inline

Follow-up surfaced by **M2-T18** post-delivery review. The separate `/threads/[id]` page was the wrong split — the requested behavior is "tool calls inline in the main chat, collapsed by default."

## Why

`/threads/[id]` em página separada quebra o fluxo. Tool calls são contexto da conversa — pertencem inline ao lado das mensagens do agente. Colapsado por default mantém o chat enxuto; quem quer ver o JSON expande on-demand. UsageBadge fica como header opcional do chat (toggle), não tela própria.

## Why this was deferred from M2-T18

A spec original do M2-T18 dizia explicitamente "page `/threads/[id]`" + "Sidebar volta pra `/chat`", então a implementação seguiu o que estava escrito. Revisão pós-entrega identificou o split como atrito de UX desnecessário — corrigir requer mover renderização + reutilizar componentes, não rewrite.

## Depends on

[M2-T18] queries `webChat.queries.listThreadEvents` + `cost.queries.byThread` + componentes `ToolCallCard`/`UsageBadge` já existem e devem ser reaproveitados. Sem mudança de query/server.

## Acceptance tests (write FIRST)

- `convex/webChat/queries/listThreadEvents.test.ts` — já cobre o servidor; sem mudança.
- Nova UI test (Vitest + RTL, ou test do query exercitando a shape):
  - thread com user → assistant text → tool-call → tool-result renderiza na ordem certa (mensagem do user, mensagem do assistant, accordion da tool entre os dois turns onde foi chamada).
  - accordion **fechado por default** (`<details>` sem atributo `open`).
  - clicar abre e mostra `args` + `result` JSON formatados.
  - tool-call sem result mostra `_running…_`.
- Manual smoke: golden path no `/chat` com `http.fetch` ativo — vê o accordion fechado, expande, confere args + result.

## Implementation

- **Trocar a fonte de dados de `MessageList`** de `webChat.queries.listMessages` para `webChat.queries.listThreadEvents` (já entrega união discriminada com `kind`).
- **Render inline com switch no `kind`**:
  - `kind: "text"` → bubble user/assistant existente.
  - `kind: "tool-call"` → reusar `ToolCallCard`. Mover de `app/threads/[id]/ToolCallCard.tsx` para `app/chat/ToolCallCard.tsx` (ou `app/_components/` se outro consumidor aparecer).
  - `kind: "tool-result"` → não renderizar standalone; já é puxado pelo `ToolCallCard` matched por `toolCallId` (mesmo pareamento que `ThreadDetail.tsx` faz hoje).
- **`UsageBadge` vira header colapsável do chat** (também `<details>` fechado por default), não substitui o input. Reusar `cost.queries.byThread`.
- **Aposentar `/threads/[id]`**:
  - Deletar `app/threads/[id]/page.tsx` + `ThreadDetail.tsx`.
  - Mover `ToolCallCard.tsx` + `UsageBadge.tsx` para `app/chat/`.
  - Remover o link "View tool calls & cost →" de `ChatShell.tsx` (não tem mais destino).
  - Manter os queries `listThreadEvents` + `byThread` — são a base do novo render.

## Non-goals

- Streaming incremental do tool-call (live edit conforme args chegam) — fica para depois; reactive `useQuery` é suficiente para M2/M3.
- Filtro/busca de tool calls dentro do chat — overkill para o scope.
- Manter compat de `/threads/[id]` (redirect ou similar). A página é deletada limpamente; ninguém deveria ter bookmark dela ainda (M2-T18 acabou de sair).

## Done when

- `/chat` renderiza tool calls inline, colapsados por default.
- `/threads/[id]` removido (404 nativo do Next App Router).
- Tests verdes (suite atual ≥ 427 passos passa, novos cases passam).
- Manual smoke confirma collapse/expand + JSON formatado.

## References

- Componentes a reaproveitar: `app/threads/[id]/ToolCallCard.tsx`, `app/threads/[id]/UsageBadge.tsx`.
- Query base: `convex/webChat/queries/listThreadEvents.ts` — `kind`/`order`/`stepOrder` já entregam ordenação inline-pronta.
- UI atual: `app/chat/MessageList.tsx` (alvo do swap).
- Plano: `~/.claude/plans/nao-faz-sentido-isso-peppy-fairy.md`.
