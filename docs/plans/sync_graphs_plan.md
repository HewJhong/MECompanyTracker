# Implementation Plan: Sync Analytics Performance Graph with Dashboard

## Goal Description
The "Outreach Performance Over Time" graph on the Analytics page currently uses a different style (vertical bars) and different calculation logic compared to the Dashboard page. The user wants them to be the same. I will port the SVG-based `OutreachPerformanceLineChart` component and the backward-cumulative calculation logic from the Dashboard to the Analytics page.

## Proposed Changes

### Frontend Component Updates
#### [MODIFY] `pages/analytics.tsx`
- **Port Component**: Add the `OutreachPerformanceLineChart` functional component to the file.
- **Update Calculation (`stats` useMemo)**:
  - Update the timeline processing to use the "Backward-cumulative" logic from `index.tsx`. This ensures the final values in the graph match the current totals displayed in the cards.
  - Remove the old `cumulativeTimeline` logic.
- **Update UI**: Replace the current timeline graph JSX block with the `<OutreachPerformanceLineChart timeline={stats.timeline} />` component.
- **Update Imports**: Ensure `useState` and any other required hooks are imported.

## Verification Plan

### Manual Verification
1. Compare the "Outreach Performance" graph on the Dashboard and Analytics pages.
2. Verify they look identical (same SVG lines, same color scheme, same metric dropdown).
3. Verify the final value on the graphs matches the current totals for "Contacted", "Interested", and "Registered".
4. Toggle between metrics (Contacted/Interested/Registered) and verify the graph updates correctly.
