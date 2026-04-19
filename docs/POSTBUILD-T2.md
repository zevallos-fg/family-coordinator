# POSTBUILD-T2 — Deferred items from T2 build

## Schedule tab

### Two-image calendar support (highest priority)
The v8.4 reference uses TWO separate calendar screenshots (one per parent) for more accurate duty assignment. The current skill accepts one image only.

**Proposed Input change:**
```typescript
export interface Input {
  images: Array<{
    base64: string;
    mimeType: "image/jpeg" | "image/png";
    personName: string;  // "Fernando" | "Yenny"
  }>;
  weekOf: string;
  knownNames: string[];
}
```

**Current workaround:** User uploads a shared Google Calendar screenshot showing all events.

### Duty assignment by user_id
`schedule_entries.assigned_to_user_id` is left null. Assignee name is stored in `notes` as plain text (e.g., "Fernando"). To properly link duties to users, add name→uuid resolution in `saveReconciliation` action using `family_members JOIN users ON full_name = notes`.

### Schedule entry editing
No UI for manually editing/overriding individual duty assignments after saving. The v8.4 app had a tap-to-cycle (Fernando → Yenny → DISCUSS) pattern. Add server action `updateDutyAssignee(id, newAssignee)` and optimistic UI toggle.

### Export to clipboard
v8.4 had a "Copy Week to Clipboard" button for pasting into group chat. Log as quick feature if Fernando requests.

## Organized tab

### Move to grocery from Organized
v8.4 had a 🛒 button on each capture item to move it to grocery (with AI parsing). `CaptureItem` has an `onMove` prop wired up but the actual move-to-grocery action was not implemented. Add `moveToGrocery(id)` server action that:
1. Fetches capture text
2. Calls `family-grocery-parser`
3. Inserts items into `grocery_items`
4. Deletes the capture

### Pagination
Organized page loads up to the first 50 captures per category. If a family has >50 captures, older ones are not shown. Add cursor pagination.

## Grocery tab

### In-cart clearing
No "Clear cart" button to remove all checked-off items. Add `clearCart()` server action that sets `completed_at = now()` for all `in_cart = true` items in the family.

### Custom store creation
No UI for adding new stores. The stores are seeded in migration 008. Add a modal for creating stores.

## App shell

### CSS scrollbar hiding
`components/nav/TopNav.tsx` uses `hide-scrollbar` class for the overflow-x nav but this isn't a standard Tailwind class. Add a global CSS rule or use Tailwind plugin. Currently falls back gracefully.

### SpendIndicator polling
`SpendIndicator` polls `/api/spend` every 60 seconds. Consider WebSocket or Server-Sent Events for real-time updates.

## Code quality

### CategoryColumn server action prop
`CategoryColumn` defines an inline server action `handleMove` and passes it to `CaptureItem`, but `CaptureItem` doesn't call it. Either implement the move UI in CaptureItem or remove `onMove` from the interface.

### VoiceButton type safety
`VoiceButton` uses `any` for Web Speech API types because `@types/dom-speech-recognition` is not in the project. Add the package when T4 updates `package.json` (or Fernando can add it).
