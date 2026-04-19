# family-grocery-parser

**Track:** T2
**Model tier:** haiku
**Purpose:** Free-text grocery mentions → structured item list with store matching

## How it works

1. User types or speaks a grocery-related capture
2. Skill sends text to Haiku with store context
3. Haiku extracts individual items with quantity, unit, and store match
4. Items are inserted into `grocery_items` table

## Input

```typescript
{
  text: string;                              // free text from voice or keyboard
  stores: Array<{ id: string; name: string }>;  // family's known stores
}
```

## Output

```typescript
{
  items: Array<{
    name: string;         // clean item name, capitalized
    quantity: number | null;
    unit: string | null;  // "gallon", "lb", "pack", etc.
    storeId: string | null;  // matched to provided store list, or null
    notes: string | null;    // brand preference, ripeness, size, etc.
  }>;
}
```

## Example

Input:
```
text: "need bananas, 2 gallons of milk, and paper towels at Costco"
stores: [{ id: "uuid-costco", name: "Costco" }]
```

Output:
```json
{
  "items": [
    { "name": "Bananas", "quantity": null, "unit": null, "storeId": null, "notes": null },
    { "name": "Milk", "quantity": 2, "unit": "gallon", "storeId": "uuid-costco", "notes": null },
    { "name": "Paper Towels", "quantity": null, "unit": null, "storeId": "uuid-costco", "notes": null }
  ]
}
```

## Cost estimate

- Input: ~100–200 tokens
- Output: ~50–150 tokens
- Haiku pricing: ~$0.25/1M input, $1.25/1M output
- Estimated per call: **< $0.0001**
