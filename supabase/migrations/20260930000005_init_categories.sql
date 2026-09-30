-- PayMind schema v1 — part 5/5: system category tree (owner_id is null).
-- Clients and the AI reference system categories by slug; ids are generated.
-- Shared expenses should use system categories: a user's own categories are invisible
-- to the other members of a space.

insert into public.categories (slug, name, icon, sort_order) values
  ('food',           'Food',           'utensils',       10),
  ('groceries',      'Groceries',      'shopping-basket', 20),
  ('transport',      'Transport',      'bus',            30),
  ('travel',         'Travel',         'plane',          40),
  ('stay',           'Stay',           'bed',            50),
  ('shopping',       'Shopping',       'shopping-bag',   60),
  ('entertainment',  'Entertainment',  'film',           70),
  ('subscriptions',  'Subscriptions',  'repeat',         80),
  ('utilities',      'Utilities',      'bolt',           90),
  ('rent',           'Rent',           'home',          100),
  ('education',      'Education',      'graduation-cap', 110),
  ('health',         'Health',         'heart-pulse',   120),
  ('household_help', 'Household help', 'hand-helping',  130),
  ('emi',            'EMI',            'landmark',      140),
  ('insurance',      'Insurance',      'shield',        150),
  ('activities',     'Activities',     'ticket',        160),
  ('other',          'Other',          'circle',        999);

insert into public.categories (parent_id, slug, name, icon, sort_order)
select p.id, c.slug, c.name, c.icon, c.sort_order
from (values
  ('food',      'food.dining',           'Dining',      'utensils', 11),
  ('food',      'food.cafe',             'Café',        'coffee',   12),
  ('transport', 'transport.local_rides', 'Local rides', 'car-taxi', 31),
  ('transport', 'transport.fuel',        'Fuel',        'fuel',     32)
) as c(parent_slug, slug, name, icon, sort_order)
join public.categories p on p.slug = c.parent_slug and p.owner_id is null;
