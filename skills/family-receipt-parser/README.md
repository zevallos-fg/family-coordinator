# family-receipt-parser

**Track:** T4
**Model tier:** haiku (vision, ~$0.01/image)
**Purpose:** Photo of a grocery receipt → structured items + prices

## Input

```typescript
{
  imageBase64: string;           // base64-encoded image data
  imageMimeType: "image/jpeg" | "image/png" | "image/webp";
  knownStores: Array<{ id: string; name: string }>;  // family's store list for matching
}
```

## Output

```typescript
{
  storeId: string | null;        // matched store id, or null
  storeName: string | null;      // store name as seen on receipt
  receiptDate: string | null;    // ISO date or null
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number | null;
    totalPrice: number;
    category: string | null;     // "produce", "dairy", "meat", etc.
  }>;
  subtotal: number | null;
  tax: number | null;
  total: number;
}
```

## Example

Input: JPEG of a Publix receipt
Output:
```json
{
  "storeId": "store-publix-id",
  "storeName": "Publix",
  "receiptDate": "2026-04-15",
  "items": [
    { "name": "BANANAS", "quantity": 1, "unitPrice": 0.59, "totalPrice": 0.59, "category": "produce" },
    { "name": "WHOLE MILK 1GAL", "quantity": 2, "unitPrice": 3.99, "totalPrice": 7.98, "category": "dairy" }
  ],
  "subtotal": 8.57,
  "tax": 0.0,
  "total": 8.57
}
```
