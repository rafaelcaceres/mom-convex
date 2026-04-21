# [M3-T10] Skill `notion.search`

## Why
Read-only baseline pra Notion. Write (append to page) opcional pós-M3.

## Depends on
[M3-T08] notion OAuth, [M2-T05] invoke

## Acceptance tests (write FIRST)
- `convex/skills/impls/notionSearch.test.ts`
  - query string → resultados via API Notion search
  - filter por tipo (page/database) opcional
  - sem credential → erro estruturado
  - rate limit 429 → retry com backoff

## Implementation
- `convex/skills/impls/notionSearch.ts`
- `convex/skills/_libs/notionClient.ts` — wrapper fetch

## Done when
- Tests verdes
- Seed catálogo

## References
- [Notion Search API](https://developers.notion.com/reference/post-search)
