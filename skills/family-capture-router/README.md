# family-capture-router

Routes free-text captures from parents into household management categories and detects grocery items.

## What it does

Given a short free-text capture like "need to pick up oregano and paper towels" or "Emma has soccer practice Thursday 4pm", the skill returns:

- `categoryId` — the best-matching category UUID from the family's category list, or `null` if no good match
- `isGrocery` — `true` if the capture is a shopping item / reminder to buy something
- `groceryItems` — if grocery, a clean list of individual item names (no quantities, no filler words)

## Example

**Input:**
```json
{
  "text": "need to pick up oregano, chili powder, and paper towels",
  "categories": [
    { "id": "abc-123", "name": "Groceries" },
    { "id": "def-456", "name": "Kids" }
  ]
}
```

**Output:**
```json
{
  "categoryId": "abc-123",
  "isGrocery": true,
  "groceryItems": ["oregano", "chili powder", "paper towels"]
}
```

## Model

- **Tier:** haiku (`claude-haiku-4-5-20251001`)
- **Cost per call:** ~$0.0001–$0.001 (200 input / 50 output tokens typical)
- **Max tokens:** 500

## Prompt engineering notes

- System prompt instructs the model to return bare JSON only — no markdown fences, no explanation
- Compound grocery items are explicitly instructed to be split ("oregano and chili powder" → two items)
- Output validated against a Zod schema; malformed responses surface as `parse_error`
- Categories are injected as a bulleted id:name list to keep the prompt compact

## Used by

- T2: Mental Dump → Organized view + Grocery flow (primary consumer)
- `/api/_dev/test-skill` — dev-only smoke route for pipeline verification
