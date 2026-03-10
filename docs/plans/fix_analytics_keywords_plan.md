# Implementation Plan: Tighten Analytics Trend Logic

## Goal Description
The outreach performance trend graph in the Analytics page uses broad keyword matching (e.g., `includes('outreach')`) which causes non-outreach logs (like simple company updates or system messages) to be counted as progress. This results in inaccurate trend lines. I will update the logic to use more specific patterns matching the actual status transition strings.

## Proposed Changes

### Frontend Component Updates
#### [MODIFY] `pages/analytics.tsx`
- **Tighten Keyword Matching in `stats` memo**:
  - Update the loop that processes `history` to look for specific status transition patterns and the new log prefixes.
  - **Contacted**: Look for `→ Contacted` or `[Outreach #`.
  - **Interested**: Look for `→ Interested` or `[Company Reply]`.
  - **Registered**: Look for `→ Registered`.
  - Remove generic checks like `.includes('outreach')` or `.includes('completed')` which are too prone to false positives.

## Verification Plan

### Manual Verification
1. Navigate to the Analytics page.
2. Observe the "Outreach Performance Over Time" graph.
3. If all companies are currently "To Contact" and no outreach has been logged, the graph should now be flat at zero (excluding any historical outreach logs that *should* be there).
4. Log a new outreach action for a company and verify the "Contacted" line in the graph increments for today.
5. Update a company's status to "Interested" and verify the "Interested" line increments.
6. Check the "Recent Activity Logs" table at the bottom to ensure the logs are displayed correctly and match the data being counted.
