# Phase 6 — content performance

The final planned phase links calendar posts and publication history to campaigns, optional ad IDs, and audience labels. Ads → “المحتوى والحملات ونتائج البيع” contains link management and a reversible result ledger. Reports → “نتائج المحتوى المسجّلة” groups results by angle, material, audience, campaign, or post and exports CSV.

## Data and arithmetic

- Links and results live inside the company workspace under `ads.contentLinks` and `ads.performanceRecords`; normal persistence, pending sync, recovery snapshots and portable backup retain them. Existing workspaces remain valid.
- Inputs are manually attributed, post-specific numbers for an inclusive date range: spend/revenue in EGP, impressions, clicks, inquiries, qualified inquiries, measurements, contracts. Blank is unknown (`null`); zero is an observed zero. Campaign CSV supplies campaign-name suggestions only.
- Results retain dimension snapshots. Editing a link leaves historical reports intact. Explicitly editing a result takes current link dimensions; the previous material can be retained. Removing a calendar post does not remove results. Active publication state is checked separately and missing publication registration is visible.
- Each result contributes once to one material bucket, including “unknown”. A multi-material creative does not multiply spend or outcomes.
- Overlapping periods for the same content, campaign, ad and audience are rejected. Manual allocations can overlap only with different allocation definitions. The operator must enter disjoint numbers; the app cannot verify an external allocation or deduplicate customers across different posts/ads/audiences.
- Group totals show known-value coverage. Derived costs and revenue/spend require complete numerator and denominator data and a positive denominator. Conversion percentages additionally require every included row to describe the same customer cohort within that row. Aggregate rates use summed counts, not averages of row percentages.
- Date filters include fully contained records. Partial intersections are counted as excluded, never prorated. Archived links retain results; voided results leave totals and can be restored subject to overlap validation.
- Legacy offline sales and daily campaign logs remain separate. Their old labels now describe ratios between recorded totals, without claiming causal attribution or combining them with content results.
- CSV includes numeric known totals, coverage per metric, derived ratios, UTF-8 BOM and spreadsheet-formula escaping.

## Verification

Run `node tests/phase1.test.cjs` through `node tests/phase6.test.cjs` (Node 18+, no dependencies). 123 simulated regression checks pass: 95 existing and 28 phase-six checks. The new tests exercise known arithmetic fixtures, missing/zero data, overlap/allocation rules, cohort validation, frozen dimensions, every grouping, date boundaries, archive/restore, real editor persistence, backup/reload, publication/calendar identity, company isolation, asynchronous locking, escaped output and legacy separation.

These are dependency-free simulated DOM/IndexedDB/network checks, not visual browser or live Gemini verification. No advertising-platform API integration or automatic causal attribution is included. Actual mobile/desktop appearance and real-account end-to-end operation still require a live browser pass.
