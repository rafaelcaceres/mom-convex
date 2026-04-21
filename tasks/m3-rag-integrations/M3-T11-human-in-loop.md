# [M3-T11] Human-in-loop confirmation — pending state + resume

## Why
Skills com `sideEffect: "write"` (ou heurística) não executam sem aprovação humana. Essencial pra produção: evita prompt injection fazer drafts/bash destrutivos.

## Depends on
[M2-T05] invoke, [M2-T01] handleIncoming

## Acceptance tests (write FIRST)
- `convex/approvals/adapters/approval.repository.test.ts`
  - `create({turnId, skillKey, args, preview, status:"pending"})` persiste
  - `approve(id, userId)` muda status, registra approver
  - `reject(id, userId, reason?)` idem
- `convex/agentRunner/internal/resumeAfterApproval.test.ts`
  - approval aprovada → resume turn, executa skill, continua loop
  - rejeitada → envia mensagem "cancelado" ao agent como tool result + continua
- `test/e2e/approval-flow.spec.ts`
  - agent tenta `gmail.send_draft` → UI mostra card com preview e botões
  - clique "Approve" → draft criado no Gmail (mock)
  - clique "Reject" → mensagem no chat

## Implementation
- `convex/approvals/domain/approval.model.ts` — `turnId`, `threadId`, `skillKey`, `args`, `preview`, `status`, `resolvedAt?`, `resolvedBy?`, `reason?`
- `convex/approvals/adapters/approval.repository.ts`
- `convex/approvals/mutations/approve.ts`, `reject.ts`
- `convex/agentRunner/internal/resumeAfterApproval.ts` — internalAction; chamada por trigger `approvals` update
- `components/chat/ApprovalCard.tsx` — UI inline
- Slack: postar card com botões (Block Kit); callback via httpAction `/slack/actions` (registrar em M3-T11 ou M4)

## Done when
- Tests verdes
- E2E verde
- Documentar: turn fica pausado em aberto; TTL? (proposta: 24h auto-reject)

## References
- [Plano §Confirmação human-in-loop](~/.claude/plans/a-pasta-docs-tem-shiny-scone.md)
