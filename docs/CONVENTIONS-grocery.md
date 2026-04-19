# Grocery Integration Convention

## Write side: T3 meal planner

When `generatePlanAction` in `app/(app)/meals/actions.ts` inserts grocery items from a meal plan delta:

- `family_id`: current family
- `name`: formatted as `"ingredient name (qty unit)"` when quantity is known, or just `"ingredient name"` when null
- `quantity`: formatted string combining quantity + unit (e.g. `"3 lb"`) or `null` when quantity is unknown
- `store_id`: `NULL` — user assigns store in Grocery tab
- `in_cart`: `false`
- `source_capture_id`: `NULL` — meal planner items have no capture origin

Note: The `grocery_items` table has no `source` or `unit` columns (schema is `quantity: string | null`). Quantity + unit are combined into the single `quantity` string field.

## Read side: T2 grocery tab

The grocery list shows all items for the family regardless of how they were created. Items written by the meal planner will have `source_capture_id = NULL` and a `quantity` string that may contain the unit (e.g. `"3 lb"`, `"0.5 cup"`).

T2 may optionally distinguish meal-planner items by checking `source_capture_id IS NULL` — these items were not created from a voice/text capture and may be grouped or badged differently.

## De-duplication

If the user already has "olive oil" in `grocery_items` and the meal planner writes another "olive oil" row, two rows will exist. This is intentional for MVP — the user can check both off in the Grocery tab. Post-MVP: add dedupe logic in the Grocery tab (see POSTBUILD-T3.md).

## Pantry reduction

The meal planner skill (`family-meal-planner`) subtracts pantry quantities from the grocery delta before writing. If pantry covers an ingredient fully, `quantityNeeded` is 0 and the item is NOT written to `grocery_items`. Only items with `quantityNeeded > 0` or `quantityNeeded = null` (unknown quantity) are written.
