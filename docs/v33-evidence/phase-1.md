# Phase 1 Gate Evidence — v33.0.0

Migration applied: `20260425_v33_dragnet_backfill.sql`
Applied via: `supabase db query --linked -f`
Date: 2026-04-25

## Gate Q1 — recipes columns (expected: 6)
```json
{ "count": 6 }
```
PASS

## Gate Q2 — ingredients columns (expected: 5)
```json
{ "count": 5 }
```
PASS

## Gate Q3 — meal_plan_entries columns (expected: 3)
```json
{ "count": 3 }
```
PASS

## Gate Q4 — grocery_items columns (expected: 5)
```json
{ "count": 5 }
```
PASS

## Gate Q5 — new tables (expected: 5)
```json
{ "count": 5 }
```
PASS

## Gate Q6 — row counts (expected: 13, 108, 155, 76, 21)
```json
{
  "recipes": 13,
  "ingredients": 108,
  "recipe_ingredients": 155,
  "grocery_items": 76,
  "meal_plan_entries": 21
}
```
PASS — all row counts match exactly (no data was lost)

## Gate Q7 — pg_trgm extension (expected: 1)
```json
{ "count": 1 }
```
PASS

## Gate Q8 — RLS enabled on 5 new tables (expected: 5 rows, all rowsecurity=true)
```json
[
  { "tablename": "ingredient_form_units", "rowsecurity": true },
  { "tablename": "ingredient_resolution_log", "rowsecurity": true },
  { "tablename": "maintenance", "rowsecurity": true },
  { "tablename": "meal_log", "rowsecurity": true },
  { "tablename": "person_nutrition_targets", "rowsecurity": true }
]
```
PASS — 5 rows, all rowsecurity=true

## Cost check
$0.21 of $7.00 limit — safe to continue.

## Deviation: maintenance.next_due_at generated column
The plan specified:
```sql
next_due_at date generated always as (case when last_done_at is null then null else last_done_at + (cadence_days || ' days')::interval end) stored
```
This is non-immutable (interval cast is non-deterministic). Fixed to:
```sql
next_due_at date generated always as (case when last_done_at is null then null else last_done_at + cadence_days end) stored
```
`date + integer` in PostgreSQL adds days and is immutable. Semantically equivalent.
