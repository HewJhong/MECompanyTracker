# Implementation Plan: Remove Quick Stats Panel

## Summary
The user wants to remove the "Quick Stats" panel from the sidebar menu to simplify the interface.

## Proposed Changes

### [x] 1. Update `components/Layout.tsx`
- Remove the JSX block for the "Quick Stats" panel (lines 113-132).
- Remove the unused `BellIcon` import from `@heroicons/react/24/outline`.

## Verification Plan

### Manual Verification
1. Run the application locally (`npm run dev`).
2. Open the application in a browser.
3. Check the sidebar on desktop and mobile.
4. **Verify**: The "Quick Stats" panel should no longer be visible.
5. **Verify**: No visual broken layout elements should remain in its place.

