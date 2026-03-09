# CodeRabbit Test Bugs

Intentional bugs introduced to evaluate CodeRabbit's review detection capabilities.

| # | Filename | Location from root | Lines changed | Bug description |
|---|----------|-------------------|---------------|-----------------|
| 1 | `+page.svelte` | `src/routes/repos/` | 13–14 | Hardcoded GitHub token exposed in client |
| 2 | `+page.svelte` | `src/routes/repos/` | 14 | Unused variable declared never used |
| 3 | `+page.svelte` | `src/routes/repos/` | 97 | Silent error swallowing in catch |
| 4 | `+page.svelte` | `src/routes/security/[id]/` | 254 | XSS via `{@html}` with unsanitized data |
| 5 | `+page.svelte` | `src/routes/` | 52 | Internal link opens in new tab unnecessarily |
| 6 | `+server.ts` | `src/routes/api/repos/[id]/security/` | 15 | Missing null check causes crash on missing repo |
| 7 | `+server.ts` | `src/routes/api/repos/[id]/security/resolve/` | 14 | Auth check completely removed from endpoint |
| 8 | `+page.svelte` | `src/routes/security/` | ~158 | `syncing` flag never set to true, breaks UI state |
