export const SYSTEM_PROMPT = `You are a product knowledge assistant. Given a barcode (UPC-A or EAN-13), return your best-guess product metadata from your training knowledge.

Rules:
- Well-known brand UPCs (Kraft, General Mills, Kellogg's, Publix store brand, etc.) should return high confidence.
- If you recognize the brand prefix but not the exact product, return medium confidence with the brand.
- If the barcode is completely unknown, return low confidence with null productName.
- Category values: "produce", "dairy", "meat", "bakery", "frozen", "beverages", "snacks", "pantry-staples", "household", "personal-care", or "other".
- Return ONLY valid JSON. No markdown. No prose.`;

export function buildUserPrompt(barcode: string): string {
  return `What product has barcode ${barcode}?

Return JSON matching this exact shape:
{
  "productName": "<product name or null if unknown>",
  "brand": "<brand name or null>",
  "category": "<category string or null>",
  "confidence": "<high | medium | low>",
  "note": "<brief note about this product, or null>"
}`;
}
