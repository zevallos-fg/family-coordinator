-- Migration: recipe_title_case_and_family_default_serves
-- Applied: 2026-04-19 as part of v32.0 / PR-3

-- Recipe title-case normalization
UPDATE recipes SET title = 'Apple Cider Beef Stew' WHERE id = '78f073b1-784f-41e2-b557-da420e5520dd';
UPDATE recipes SET title = 'Banana Berry Nice Cream' WHERE id = '98c140cb-0e91-4212-91e1-9f685db9dbef';
UPDATE recipes SET title = 'Blueberry Pancakes' WHERE id = 'd34cd80a-cb7b-4ec5-a846-c7c37f88f06c';
UPDATE recipes SET title = 'Chickpea and Cucumber Salad with Creamy Yogurt Dressing' WHERE id = '4c1246e8-ea1b-4a15-8554-e5d74a9c6aef';
UPDATE recipes SET title = 'Chicken, Maple, and Tarragon Breakfast Patties' WHERE id = '6be9dac0-3b23-4a00-87b1-6dbe231b5097';
UPDATE recipes SET title = 'Gingered Cashew Chicken and Sugar Snap Peas' WHERE id = 'da58cfda-aac6-4f01-844d-1c8b80d19532';

-- Family default_serves for configurable meal plan portion sizes
ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS default_serves SMALLINT NOT NULL DEFAULT 4
  CHECK (default_serves BETWEEN 1 AND 20);

COMMENT ON COLUMN public.families.default_serves IS
  'Default number of servings per meal for this family. Used by the meal planner when recipe servings are not specified.';
