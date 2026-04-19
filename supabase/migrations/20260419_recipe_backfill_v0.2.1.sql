-- Recipe backfill v0.2.1
-- Curated metadata for the 13 existing family recipes.
-- Rules: COALESCE preserves any already-populated values.
-- Never changes: id, family_id, title, created_by_user_id, created_at.
-- instructions only included where confidence is high.

-- 1. apple cider beef stew (has instructions, cook_time=90)
UPDATE public.recipes SET
  description    = 'A hearty, slow-braised beef stew with apple cider and root vegetables. The cider adds a subtle sweetness that balances the savory broth.',
  tags           = ARRAY['dinner', 'american', 'weekend-project', 'batch-cook', 'freezer-friendly'],
  prep_time_min  = COALESCE(prep_time_min, 20),
  cook_time_min  = COALESCE(cook_time_min, 90),
  servings       = COALESCE(servings, 6)
WHERE id = '78f073b1-784f-41e2-b557-da420e5520dd';

-- 2. Asian Chicken Lettuce Wraps (minimal instructions in DB)
UPDATE public.recipes SET
  description    = 'Savory ground chicken with water chestnuts and hoisin sauce, served in crisp lettuce cups. A light, fast dinner that feels festive.',
  tags           = ARRAY['dinner', 'asian', 'quick', 'low-carb'],
  prep_time_min  = COALESCE(prep_time_min, 15),
  cook_time_min  = COALESCE(cook_time_min, 15),
  servings       = COALESCE(servings, 4)
WHERE id = 'e95b1b95-c69b-4801-9f3d-ce616e39e9f4';

-- 3. banana berry nice cream (has instructions)
UPDATE public.recipes SET
  description    = 'A no-cook frozen dessert made entirely from blended frozen bananas and berries. Tastes like ice cream with no added sugar or dairy.',
  tags           = ARRAY['snack', 'vegan', 'dairy-free', 'no-cook', 'quick', 'gluten-free'],
  prep_time_min  = COALESCE(prep_time_min, 5),
  cook_time_min  = NULL,
  servings       = COALESCE(servings, 2)
WHERE id = '98c140cb-0e91-4212-91e1-9f685db9dbef';

-- 4. Black Bean Soup (has instructions)
UPDATE public.recipes SET
  description    = 'A thick, smoky black bean soup with cumin and lime. Makes a satisfying lunch or light dinner and reheats well all week.',
  tags           = ARRAY['lunch', 'dinner', 'vegetarian', 'one-pot', 'batch-cook', 'weeknight'],
  prep_time_min  = COALESCE(prep_time_min, 10),
  cook_time_min  = COALESCE(cook_time_min, 30),
  servings       = COALESCE(servings, 4)
WHERE id = '8c873c15-3c10-4a0b-8256-71aeb5eb3d79';

-- 5. blueberry pancakes (has instructions; almond/tapioca/coconut flour = gluten-free variant)
UPDATE public.recipes SET
  description    = 'Fluffy gluten-free pancakes made with almond and coconut flour, studded with fresh blueberries. A weekend breakfast worth the effort.',
  tags           = ARRAY['breakfast', 'gluten-free', 'american', 'weeknight'],
  prep_time_min  = COALESCE(prep_time_min, 10),
  cook_time_min  = COALESCE(cook_time_min, 20),
  servings       = COALESCE(servings, 4)
WHERE id = 'd34cd80a-cb7b-4ec5-a846-c7c37f88f06c';

-- 6. Chicken Salad (minimal instructions)
UPDATE public.recipes SET
  description    = 'A classic poached chicken salad with a creamy dressing. Good on sandwiches, lettuce cups, or straight from the bowl.',
  tags           = ARRAY['lunch', 'american', 'make-ahead', 'quick'],
  prep_time_min  = COALESCE(prep_time_min, 15),
  cook_time_min  = COALESCE(cook_time_min, 20),
  servings       = COALESCE(servings, 4)
WHERE id = 'f8775f85-f566-410e-9749-179b3a70946c';

-- 7. Chicken, maple, and tarragon breakfast patties (8 servings — batch cook)
UPDATE public.recipes SET
  description    = 'Savory ground chicken patties seasoned with maple syrup and tarragon. Make a batch on Sunday and reheat for fast weekday breakfasts.',
  tags           = ARRAY['breakfast', 'american', 'batch-cook', 'make-ahead', 'freezer-friendly', 'weeknight'],
  prep_time_min  = COALESCE(prep_time_min, 15),
  cook_time_min  = COALESCE(cook_time_min, 20),
  servings       = COALESCE(servings, 8)
WHERE id = '6be9dac0-3b23-4a00-87b1-6dbe231b5097';

-- 8. chickpea and cucumber salad with creamy yogurt dressing (has instructions)
UPDATE public.recipes SET
  description    = 'A bright, filling salad of chickpeas, cucumber, and herbs tossed in a tangy yogurt dressing. Ready in minutes, no cooking required.',
  tags           = ARRAY['lunch', 'vegetarian', 'mediterranean', 'no-cook', 'quick'],
  prep_time_min  = COALESCE(prep_time_min, 15),
  cook_time_min  = NULL,
  servings       = COALESCE(servings, 6)
WHERE id = '4c1246e8-ea1b-4a15-8554-e5d74a9c6aef';

-- 9. Falafel (has instructions; high confidence on prep/cook)
UPDATE public.recipes SET
  description    = 'Crispy fried or baked chickpea fritters seasoned with cumin, coriander, and fresh herbs. Serve in pita with tahini or alongside a salad.',
  tags           = ARRAY['dinner', 'lunch', 'vegetarian', 'vegan', 'middle-eastern', 'weekend-project'],
  prep_time_min  = COALESCE(prep_time_min, 20),
  cook_time_min  = COALESCE(cook_time_min, 25),
  servings       = COALESCE(servings, 6)
WHERE id = '54039a3d-e3a6-43a3-a0bb-ff5d400563b7';

-- 10. gingered cashew chicken and sugar snap peas (has instructions)
UPDATE public.recipes SET
  description    = 'A fast stir-fry of chicken, cashews, and sugar snap peas in a gingery tamari sauce. Table-ready in under 30 minutes.',
  tags           = ARRAY['dinner', 'asian', 'quick', 'one-pot'],
  prep_time_min  = COALESCE(prep_time_min, 15),
  cook_time_min  = COALESCE(cook_time_min, 15),
  servings       = COALESCE(servings, 4)
WHERE id = 'da58cfda-aac6-4f01-844d-1c8b80d19532';

-- 11. Split Pea Soup (has instructions)
UPDATE public.recipes SET
  description    = 'A thick, warming split pea soup with carrots and onion. Simple pantry ingredients, long simmer, deeply satisfying.',
  tags           = ARRAY['lunch', 'dinner', 'vegetarian', 'one-pot', 'batch-cook', 'weeknight'],
  prep_time_min  = COALESCE(prep_time_min, 10),
  cook_time_min  = COALESCE(cook_time_min, 50),
  servings       = COALESCE(servings, 4)
WHERE id = '8467f8e1-1e6b-4a3e-9556-0f5a2e165585';

-- 12. Super Easy Overnight Oats (empty instructions [] in DB — backfill with canonical steps)
UPDATE public.recipes SET
  description    = 'Rolled oats soaked overnight in milk or yogurt with your choice of toppings. Absolutely no morning effort required.',
  tags           = ARRAY['breakfast', 'vegetarian', 'no-cook', 'make-ahead', 'quick'],
  prep_time_min  = COALESCE(prep_time_min, 5),
  cook_time_min  = NULL,
  servings       = COALESCE(servings, 1),
  instructions   = CASE WHEN instructions IS NULL OR instructions = '[]'
    THEN '["Combine rolled oats, milk (or plant-based milk), and a pinch of salt in a jar or container with a lid.", "Stir in any mix-ins: chia seeds, honey, vanilla, or yogurt.", "Cover and refrigerate overnight (at least 6 hours).", "In the morning, stir and add toppings: fresh fruit, nuts, or granola. Eat cold or warm in the microwave for 60 seconds."]'
    ELSE instructions
  END
WHERE id = 'bb418da7-213d-4878-a65b-37413ebca5c7';

-- 13. Teriyaki Chicken (has instructions, cook_time=20)
UPDATE public.recipes SET
  description    = 'Juicy chicken thighs glazed in a homemade teriyaki sauce of soy, mirin, and honey. A reliable weeknight favorite that works over rice or noodles.',
  tags           = ARRAY['dinner', 'asian', 'weeknight'],
  prep_time_min  = COALESCE(prep_time_min, 10),
  cook_time_min  = COALESCE(cook_time_min, 20),
  servings       = COALESCE(servings, 4)
WHERE id = '2ebef02a-5330-497b-bfa8-972030e3b8bc';
