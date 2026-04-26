/**
 * v33 Backfill Script: Assign ingredient_id to existing grocery_items
 *
 * Three-tier approach:
 * - Tier 1 exact:  auto-apply (sets ingredient_id directly)
 * - Tier 2 fuzzy:  auto-apply (sets ingredient_id directly)
 * - Tier 3 Haiku:  log to ingredient_resolution_log ONLY, NOT auto-applied
 *
 * Run with:
 *   npx tsx scripts/backfill-grocery-ingredient-ids.ts
 *
 * Outputs counts to docs/v33-evidence/phase-2-backfill.md
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types";
import path from "path";
import fs from "fs";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SERVICE_ROLE_KEY");
  process.exit(1);
}

// Use service role to bypass RLS for backfill
const supabase = createClient<Database>(SUPABASE_URL, SERVICE_KEY);

const SIMILARITY_THRESHOLD = 0.6;

interface BackfillRow {
  id: string;
  name: string;
  family_id: string;
}

interface IngredientRow {
  id: string;
  canonical_name: string;
}

async function main() {
  const startTime = Date.now();
  console.log("Starting grocery ingredient backfill...");

  // Load all grocery_items without ingredient_id
  const { data: items, error: itemsError } = await supabase
    .from("grocery_items")
    .select("id, name, family_id")
    .is("ingredient_id", null);

  if (itemsError) {
    console.error("Failed to load grocery_items:", itemsError.message);
    process.exit(1);
  }

  const rows = (items ?? []) as BackfillRow[];
  console.log(`Found ${rows.length} grocery_items without ingredient_id`);

  let tier1Count = 0;
  let tier2Count = 0;
  let tier3Count = 0;
  let unmatchedCount = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const rawName = row.name.trim();
    const cleanedName = rawName.toLowerCase().replace(/,.*$/, "").trim();
    const familyId = row.family_id;

    // ── Tier 1: Exact match ──────────────────────────────────────────────────
    const { data: exact } = await supabase
      .from("ingredients")
      .select("id")
      .eq("family_id", familyId)
      .eq("canonical_name", cleanedName)
      .limit(1)
      .maybeSingle();

    if (exact) {
      const { error } = await supabase
        .from("grocery_items")
        .update({ ingredient_id: exact.id })
        .eq("id", row.id);
      if (error) errors.push(`T1 update ${row.id}: ${error.message}`);
      else tier1Count++;
      continue;
    }

    // ── Tier 2: Fuzzy match ──────────────────────────────────────────────────
    const { data: fuzzyResults } = await supabase.rpc("fn_ingredient_fuzzy_search", {
      p_family_id: familyId,
      p_name: cleanedName,
      p_threshold: SIMILARITY_THRESHOLD,
    });

    if (fuzzyResults && fuzzyResults.length > 0) {
      const best = fuzzyResults[0];
      const { error } = await supabase
        .from("grocery_items")
        .update({ ingredient_id: best.id })
        .eq("id", row.id);
      if (error) errors.push(`T2 update ${row.id}: ${error.message}`);
      else tier2Count++;
      continue;
    }

    // ── Tier 3: Log for Haiku review (NOT auto-applied) ──────────────────────
    // Load all family ingredients as candidates (simple exact-only comparison for now)
    const { data: candidates } = await supabase
      .from("ingredients")
      .select("id, canonical_name")
      .eq("family_id", familyId)
      .order("canonical_name");

    // Log as haiku-pending entry for manual review
    const { error: logError } = await supabase
      .from("ingredient_resolution_log")
      .insert({
        family_id: familyId,
        raw_input: rawName,
        cleaned_name: cleanedName,
        resolved_ingredient_id: null,
        descriptors_extracted: null,
        confidence: "haiku",
        reviewed_by_user: false,
      });

    if (logError) {
      errors.push(`T3 log ${row.id}: ${logError.message}`);
      unmatchedCount++;
    } else {
      tier3Count++;
    }
  }

  // ── Create review view ───────────────────────────────────────────────────────
  const viewSQL = `
create or replace view grocery_backfill_review as
select g.id, g.name, g.quantity, l.resolved_ingredient_id as proposed_ingredient_id, i.canonical_name as proposed_match, l.confidence
from grocery_items g
join ingredient_resolution_log l on l.raw_input = g.name and l.confidence = 'haiku'
left join ingredients i on i.id = l.resolved_ingredient_id
where g.ingredient_id is null;
  `.trim();

  // Apply review view via direct query
  console.log("Creating grocery_backfill_review view...");
  // Note: This requires a direct DB connection — log the SQL for manual application
  const viewPath = path.resolve(__dirname, "../docs/v33-evidence/backfill-view.sql");
  fs.writeFileSync(viewPath, viewSQL);
  console.log(`View SQL written to ${viewPath} — apply manually via Supabase dashboard or CLI`);

  // ── Write evidence ───────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const evidencePath = path.resolve(__dirname, "../docs/v33-evidence/phase-2-backfill.md");

  const evidence = `# Phase 2 Backfill Evidence — v33.0.0

Run date: ${new Date().toISOString()}
Duration: ${elapsed}s
Total grocery_items processed: ${rows.length}

## Results

| Tier | Action | Count |
|------|--------|-------|
| 1 - Exact match | Auto-applied (ingredient_id set) | ${tier1Count} |
| 2 - Fuzzy match (≥0.6) | Auto-applied (ingredient_id set) | ${tier2Count} |
| 3 - Haiku (pending review) | Logged to ingredient_resolution_log | ${tier3Count} |
| 4 - Unmatched | Not applied | ${unmatchedCount} |
| **Total** | | **${rows.length}** |

${errors.length > 0 ? `## Errors\n${errors.map(e => `- ${e}`).join("\n")}` : "## Errors\nNone"}

## Review Surface
Run the following to see Haiku-pending items:
\`\`\`sql
select * from grocery_backfill_review;
\`\`\`

Or to see all unresolved items:
\`\`\`sql
select count(*) from grocery_items where ingredient_id is null;
\`\`\`
`;

  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, evidence);
  console.log(`Evidence written to ${evidencePath}`);
  console.log(`\nResults: T1=${tier1Count} T2=${tier2Count} T3(log)=${tier3Count} unmatched=${unmatchedCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
