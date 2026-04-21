# [M1-T13] UI `/chat` — mensagens reactive via threads

## Why
Interface principal de uso web. Reactive first-class: mensagens aparecem ao vivo.

## Depends on
[M1-T11] webChat mutations, [M1-T02] threads

## Acceptance tests (write FIRST)
- `test/e2e/chat.spec.ts`
  - input de texto + submit → mensagem do user aparece imediatamente
  - resposta (echo em M1, streaming em M2) aparece em <2s
  - trocar de thread preserva scroll position (opcional, marcar todo)
  - sidebar lista threads ordenado por última atividade
- Visual regression (Percy/Playwright snapshot) opcional

## Implementation
- `app/chat/page.tsx` — layout com sidebar + chat area
- `app/chat/[threadId]/page.tsx` — thread specific
- `components/chat/ThreadList.tsx` — usa `api.webChat.queries.myThreads.default`
- `components/chat/MessageList.tsx` — em M1 lista mensagens do wrapper `messages_stub`; em M2 substitui por `useThreadMessages` do `@convex-dev/agent`
- `components/chat/MessageInput.tsx` — envia via `api.webChat.mutations.sendMessage.default`
- Shadcn button/input/scroll-area; Tailwind v4

## Done when
- E2E verde
- Reactive updates funcionam em 2 abas (mesmo user → ambas recebem)

## References
- [@convex-dev/agent useThreadMessages](https://www.npmjs.com/package/@convex-dev/agent)
