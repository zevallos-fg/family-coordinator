create or replace view grocery_backfill_review as
select g.id, g.name, g.quantity, l.resolved_ingredient_id as proposed_ingredient_id, i.canonical_name as proposed_match, l.confidence
from grocery_items g
join ingredient_resolution_log l on l.raw_input = g.name and l.confidence = 'haiku'
left join ingredients i on i.id = l.resolved_ingredient_id
where g.ingredient_id is null;