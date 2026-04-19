# family-pantry-inference

**Track:** T4
**Model tier:** haiku (~$0.001/call)
**Purpose:** Given a barcode (UPC/EAN), return best-guess product metadata using model knowledge.

## Input

```typescript
{
  barcode: string;  // UPC-A, EAN-13, etc.
}
```

## Output

```typescript
{
  productName: string | null;  // null if model has no knowledge
  brand: string | null;
  category: string | null;    // "produce", "dairy", "pantry-staples", etc.
  confidence: "high" | "medium" | "low";
  note: string | null;
}
```

## Example

Input: `{ barcode: "021000015603" }`
Output:
```json
{
  "productName": "Kraft Singles American Cheese",
  "brand": "Kraft",
  "category": "dairy",
  "confidence": "high",
  "note": "Standard 16-slice package"
}
```

## Caching

Results are cached in the `barcodes` table per family. The `lookupBarcodeAction` Server Action checks the cache before calling this skill.
