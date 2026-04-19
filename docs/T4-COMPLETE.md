# T4 — Vision + Barcode — Complete

## Shipped

- Receipt upload (file picker or native camera capture via `capture="environment"`)
- `family-receipt-parser` Haiku vision skill — photo → structured items + prices
- Receipt parse preview with inline editing (name, quantity, total per item)
- Receipt list + detail views with store name and date
- Add receipt items to pantry (T3 integration — matches by canonical_name, upserts quantities)
- Barcode scanner using html5-qrcode (back camera on mobile, webcam on desktop)
- `family-pantry-inference` Haiku skill — UPC/EAN → product metadata
- Barcode cache in `barcodes` table (per family, avoids redundant skill calls)
- Barcode → pantry (adds ingredient + pantry_items row) or grocery list (adds grocery_items row)
- "Wrong product?" inline name editing on barcode result

## Skills implemented

- `family-receipt-parser` (Haiku vision, ~$0.01/image) — `skills/family-receipt-parser/`
- `family-pantry-inference` (Haiku, ~$0.001/call) — `skills/family-pantry-inference/`

## Test coverage

- `family-receipt-parser`: 7 tests — normal Publix parse, unknown store, blurry receipt, malformed JSON, empty imageBase64, api_error propagation, markdown-fenced response
- `family-pantry-inference`: 5 tests — high-confidence known UPC, unknown barcode (low confidence), malformed JSON, empty barcode, markdown-fenced response
- All 25 tests pass

## Schema notes

Actual DB schema differs slightly from the T4 prompt spec — adapted accordingly:
- `receipts.image_url` is required (not optional); storage failures fall back to `placeholder://` URL
- `receipt_items` uses `price_cents` (integer) not `unit_price`/`total_price` floats
- `receipt_items.amount` = quantity (not `quantity` column)
- `barcodes` uses `upc` column (not `barcode`) and `ingredient_id` FK (no `category`/`last_seen_at`)
- `grocery_items` has no `source` column — barcode items inserted without source tag

## Cross-track

- Depends on T3's `pantry_items` + `ingredients` schema (already exists at session start)
- Writes to `grocery_items` with `name` + `quantity="1"` — T2's Grocery tab displays these
- Receipt storage uses `receipts` Supabase Storage bucket — **bucket must exist** (Fernando: create public bucket named `receipts` in Supabase dashboard if not present)

## Dependency added

- html5-qrcode@^2.3.8

## POSTBUILD-T4 items

- Storage bucket `receipts` needs manual creation in Supabase dashboard (bucket creation not possible without service-role key at build time); until then, image_url uses `placeholder://` fallback
- OCR fallback for poor-quality receipt images (retry with higher-quality prompt, or allow manual entry)
- Multi-family barcode cache sharing — deduplicate known UPCs across families
- Barcode scanner ergonomics: larger aim area for small barcodes
- Receipt items: `unit` column always null currently — could infer from product name ("1 GAL" → unit: "gallon")
- `grocery_items` lacks a `source` column — barcode-added items indistinguishable from other sources in T2's grocery tab
- New receipt page passes `knownStores` to preview via a ref that starts empty — stores are fetched server-side during parse but not forwarded back to the client preview. The parse result contains `storeId`/`storeName` from the AI which handles matching; the store dropdown in preview only shows stores if the family fetches them at page load. Fix: convert new page to use a form-based approach or fetch stores client-side on mount.

T4 complete.
