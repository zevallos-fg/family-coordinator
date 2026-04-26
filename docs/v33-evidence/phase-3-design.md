# Phase 3 Design Spec — v33.0.0

## Flat Grocery Table (`GroceryTable.tsx`)

### Column treatment
| Col | Width | Notes |
|-----|-------|-------|
| Checkbox | 44px min (WCAG 2.5.5) | Amber check on complete |
| Item | flex-1 | Shows `name`; `qty_value qty_unit` as muted sub-label |
| Store | 120px | Clickable — opens select dropdown; shows store name or "—" |
| × delete | 44px | Rose on hover |

### Sortable headers
- Active sort column: `ChevronUp` (asc) or `ChevronDown` (desc) icon inline with label, `text-amber-700`
- Inactive: `text-stone-400`, no icon
- Click header to cycle: neutral → asc → desc → neutral
- Default: Item asc

### Cluster row rendering (same `dedup_group_id`)
- Parent row: standard treatment
- Child rows: `pl-6 text-sm` indent, a `bg-yellow-100 text-yellow-800 text-xs px-1.5 py-0.5 rounded` badge: "needs review"
- Parent delete: confirm dialog — "This will delete all X items in this group. Continue?"
- Child delete: deletes only that row

### Inline store cell edit
- Click store cell → renders `<select>` with all family stores + "No store" option
- Save on `blur` or option selection (no extra confirm)
- Update `grocery_items.store_id` via new server action `updateGroceryStore(id, storeId | null)`

### Store filter chips
- Preserved from `StoreFilter.tsx` — unchanged behavior
- Filter applies before sort

### Empty state
- Preserved from `GroceryList.tsx`: "Empty list" / "Add items above..."

---

## Merge Indicator (inline on `AddItemForm.tsx`)

### Debounce
- 300ms after last keystroke

### Banner (visible when `willMerge: true`)
```
bg-teal-50 border border-teal-200 rounded-md px-3 py-1.5 text-sm text-teal-700
"✓ Will merge with existing {name} ({qty_value} {qty_unit})"
```

### Submit button
- Normal: "Add"
- `willMerge`: "Add & merge"

### Post-submit toast (via sonner)
- `inserted`: "Added {name}"
- `merged`: "Merged into {name}"
- `review_required`: "Added {name} — needs review (different unit)"
- `inserted_unmatched`: "Added {name}"

---

## Manual Recipe Entry (new tab in `RecipeImportForm.tsx`)

### Tab label
"Manual" — third tab, after "From URL" and "From Photo"

### Required fields (submit blocked until valid)
- `title` — min 3 chars; error: "Title must be at least 3 characters"
- `servings` — integer 1–20; error: "Servings must be between 1 and 20"
- At least one ingredient row with name + qty + unit ALL filled; error: "Add at least one complete ingredient"

### Optional fields
- `description` (textarea)
- `prep_time_min`, `cook_time_min` (number inputs)
- `cuisine` (text)
- `tags` (text, comma-separated)
- `instructions` (textarea)

### Ingredient repeater
- Default: 3 empty rows
- "+ Add ingredient" button
- Each row: name (text, flex-1) | qty (number, w-16) | unit (text, w-20) | notes (text, w-24) | × remove button
- Remove button disabled when only one row remains
- Live descriptor preview: if name token is in DESCRIPTORS set, show inline hint below name field:
  `text-xs text-teal-600` — "Will save as: {cleanedName} (descriptor: {d} → notes)"

### Error display
- Inline `text-red-600 text-xs` below each invalid field
- Field borders: `border-red-400` when invalid (after first submit attempt)

### Submit button
- `opacity-50 cursor-not-allowed` when invalid
- Label: "Save Recipe"

---

## Recipes + Pantry Nav Pills (`meal-plans/page.tsx`)

### Placement
Above the week picker card, below the `<h1>`.

### Markup
```tsx
<div className="flex gap-2">
  <Link href="/meal-plans/recipes"
    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white border border-orange-200 text-sm font-medium text-orange-700 hover:bg-orange-50 transition-colors">
    Recipes ({recipeCount})
  </Link>
  <Link href="/meal-plans/pantry"
    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white border border-orange-200 text-sm font-medium text-orange-700 hover:bg-orange-50 transition-colors">
    Pantry
  </Link>
</div>
```

`recipeCount` is already queried on this page (`count: recipeCount ?? 0`).
