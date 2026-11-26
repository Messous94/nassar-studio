# Stop generating first and rejecting saturated angles afterward

Previously, generation chose angles while writing the complete post/calendar, then checked exclusions. Manual exclusions also triggered an additional semantic API review, and failed validation silently retried full generation. A click could therefore spend multiple content requests before returning an error. Numeric saturation was excluded only for approved ideas, while the workshop flagged saturation regardless of status.

## Changed behavior

- One local eligibility rule: an approved idea below 75% saturation, without a manual exclusion or a normalized-title alias of an excluded idea. Numeric saturation blocks every status, including old/pending records.
- A selector displays the individual post's angle before generation. Automatic selection uses the least saturated eligible angle. A preview lists the eight calendar angles.
- Single-post generation requires one eligible approved angle; a calendar requires eight distinct eligible approved angles. Missing eligibility stops before reference-image preparation or any content API request. New companies or exhausted banks can generate short idea candidates, review them, and approve suitable angles before writing full posts.
- The locally selected plan is sent with fixed idea IDs/titles/segments. Post generation must return exactly one item for each planned ID in order. Saved metadata uses the local angle snapshot. Models cannot silently introduce a different ID or replace the approved angle label.
- Content/idea generation sends one HTTP request per click. No automatic regeneration, post-generation semantic review, or model fallback occurs in this path, including after malformed/material/duplicate/exclusion validation failures or provider errors. Other explicitly requested AI tools retain their existing transport behavior.
- Workshop review first checks all matching angle IDs and normalized titles, prioritizing blocked aliases. Known saturated/excluded angles return a local-only result without a semantic-review request, including forced/repeated review. Part regeneration and the reference-image action also stop locally for known blocked angles.
- Clean explicit workshop reviews still work and their matching cached results avoid repeat review requests. Previously cached review schemas remain compatible.
- Existing publication data, saturation calculations, material validation, manual edits and recovery behavior remain intact. An old interface hint was corrected: publication registration, not approval, increases saturation.

## Verification

Run `node tests/generation-budget.test.cjs` plus `node tests/phase1.test.cjs` through `node tests/phase6.test.cjs`. All 141 simulation checks pass (123 existing checks updated for intentional request-policy changes and 18 focused budget regressions). Request-count assertions cover zero-call local failures, one-call successful post/calendar generation, manual exclusions without a second semantic request, numeric saturation for every status, Arabic aliases, stale angle state, bad IDs/counts/materials, publication duplicates, exhausted banks, explicit review caching, and provider errors without silent model changes.

All JavaScript and inline scripts parse; HTML IDs are unique and new selectors exist. These are mocked DOM/network/IndexedDB tests, not live account or visual-browser checks. No real provider requests were used for testing.

The app cannot guarantee a model's prose follows the intended angle's meaning. Output can still violate a plan despite correct IDs and need rejection/manual review. This change removes known pre-request failures and automatic paid loops; it cannot refund an already-completed request or prove semantic novelty without reading the output.
