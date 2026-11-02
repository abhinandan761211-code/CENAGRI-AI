-- ───────────────────────────────────────────────────────────────────────────
-- CenAGRI-AI — Crop Management demo seed (Wheat, Rice, Maize, Soybean, Tomato)
-- Run AFTER schema.sql and crop-photos.sql. Safe to re-run.
--
-- This is the ONE place fake crop rows exist, and it is opt-in: nothing is
-- inserted until you run it. Delete the block again with the bottom statement.
--
-- Photos point at /images/*.jpg from the app's public folder rather than a
-- storage object, so no upload or signed URL is needed to see the screen.
-- ───────────────────────────────────────────────────────────────────────────

-- Replace <YOUR-USER-ID> with the id from Authentication → Users in Supabase.
-- (psql:  select id, email from auth.users;)
do $$
declare
  uid uuid := '<YOUR-USER-ID>'::uuid;
begin
  -- Idempotent without a unique constraint: clear this user's seed rows first.
  delete from public.crops
   where owner_id = uid
     and name in ('Wheat', 'Rice', 'Maize', 'Soybean', 'Tomato')
     and image_url like '/images/%';

  insert into public.crops
    (owner_id, name, variety, area_ha, planted_on, growth_days, health, status,
     next_action, next_action_on, image_url)
  values
    (uid, 'Wheat',  'HD-2967', 0.97, current_date - 62, 120, 92, 'healthy',
     'Apply Urea (2nd dose)', current_date + 3,  '/images/role-farmer.jpg'),
    (uid, 'Rice',   'Shatabdi Paddy', 1.21, current_date - 74, 135, 84, 'monitor',
     'Irrigate 1st field', current_date + 2,  '/images/role-farmer.jpg'),
    (uid, 'Maize',  'HM-4 (Ashi)', 0.61, current_date - 41, 100, 88, 'healthy',
     'Fertilizer reminder', current_date + 5,  '/images/role-buyer.jpg'),
    (uid, 'Soybean','JS-2069', 0.81, current_date - 55, 105, 71, 'at_risk',
     'Fertilizer reminder', current_date + 1,  '/images/role-buyer.jpg'),
    (uid, 'Tomato', 'Pusa Ruby', 0.40, current_date - 84, 90, 95, 'healthy',
     'Fertilizer reminder', current_date + 6,  '/images/role-shop.jpg');
end $$;

-- To remove the seed again:
--   delete from public.crops where owner_id = '<YOUR-USER-ID>';
