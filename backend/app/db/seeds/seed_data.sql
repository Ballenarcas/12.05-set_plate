-- =============================================================================
-- SET&PLATE - Database Seed Script (Excludes Exercises Table)
-- Populates: RLS Policies, Users, Meals, Routines, Routine Exercises, Workouts & Sets
-- =============================================================================

-- 0. RLS POLICIES
-- The permissive "Allow public all <table>" policies that used to live here
-- exposed every row (including password hashes) to the public anon key.
-- Access is now restricted to service_role; see
-- backend/app/db/migrations/harden_rls.sql.


-- 1. DEMO USER
INSERT INTO public.users (id, email, is_premium, "Name", "Surname")
VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'demo@setandplate.com',
  true,
  'Alex',
  'Rivera'
)
ON CONFLICT (id) DO UPDATE 
SET "Name" = EXCLUDED."Name", "Surname" = EXCLUDED."Surname";


-- 2. RECENT MEALS (Last 3 days: Breakfast, Lunch, Snack, Dinner)
INSERT INTO public.meals (id, user_id, name, calories, proteins, carbs, fats, consumed_at)
VALUES
  (gen_random_uuid(), 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Oatmeal with Whey Protein & Blueberries', 420, 36.0, 54.0, 7.5, NOW() - INTERVAL '3 hours'),
  (gen_random_uuid(), 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Grilled Chicken Breast with White Rice & Broccoli', 640, 54.0, 68.0, 14.0, NOW() - INTERVAL '1 hour'),
  (gen_random_uuid(), 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Greek Yogurt Bowl with Honey & Walnuts', 340, 24.0, 28.0, 14.0, NOW() - INTERVAL '1 day 4 hours'),
  (gen_random_uuid(), 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Flank Steak with Roasted Sweet Potatoes', 710, 58.0, 60.0, 22.0, NOW() - INTERVAL '1 day 2 hours'),
  (gen_random_uuid(), 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Rice Cakes with Peanut Butter & Banana', 290, 8.0, 42.0, 11.0, NOW() - INTERVAL '1 day 6 hours'),
  (gen_random_uuid(), 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Baked Salmon with Quinoa & Green Asparagus', 670, 46.0, 48.0, 26.0, NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Eggs Scramble & Sourdough Toast', 480, 32.0, 34.0, 20.0, NOW() - INTERVAL '2 days 4 hours'),
  (gen_random_uuid(), 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Tuna Poke Bowl with Jasmine Rice & Avocado', 610, 44.0, 65.0, 18.0, NOW() - INTERVAL '2 days 2 hours'),
  (gen_random_uuid(), 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Post-Workout Whey Protein Shake', 250, 32.0, 16.0, 3.0, NOW() - INTERVAL '2 days 1 hour');


-- 3. ROUTINES
INSERT INTO public.routines (id, user_id, name)
VALUES
  ('b0000001-0000-0000-0000-000000000001', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Push Day (Chest, Shoulders & Triceps)'),
  ('b0000001-0000-0000-0000-000000000002', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Pull Day (Back & Biceps)'),
  ('b0000001-0000-0000-0000-000000000003', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Legs & Core Hypertrophy')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;


-- 4. ROUTINE EXERCISES (Automatically binds to existing exercises in public.exercises)
-- Clean existing mappings for demo routines to allow safe re-running
DELETE FROM public.routine_exercises 
WHERE routine_id IN (
  'b0000001-0000-0000-0000-000000000001', 
  'b0000001-0000-0000-0000-000000000002', 
  'b0000001-0000-0000-0000-000000000003'
);

-- Push Day exercises
INSERT INTO public.routine_exercises (id, routine_id, exercise_id, set_order, target_sets, target_reps)
SELECT 
  gen_random_uuid(),
  'b0000001-0000-0000-0000-000000000001',
  e.id,
  ROW_NUMBER() OVER (ORDER BY e.name),
  4,
  10
FROM (
  SELECT id, name FROM public.exercises 
  WHERE name ILIKE '%bench%' OR name ILIKE '%press%' OR name ILIKE '%tricep%' OR name ILIKE '%push%'
  LIMIT 5
) e;

-- Pull Day exercises
INSERT INTO public.routine_exercises (id, routine_id, exercise_id, set_order, target_sets, target_reps)
SELECT 
  gen_random_uuid(),
  'b0000001-0000-0000-0000-000000000002',
  e.id,
  ROW_NUMBER() OVER (ORDER BY e.name),
  4,
  10
FROM (
  SELECT id, name FROM public.exercises 
  WHERE name ILIKE '%row%' OR name ILIKE '%pull%' OR name ILIKE '%curl%' OR name ILIKE '%bicep%'
  LIMIT 5
) e;

-- Legs Day exercises
INSERT INTO public.routine_exercises (id, routine_id, exercise_id, set_order, target_sets, target_reps)
SELECT 
  gen_random_uuid(),
  'b0000001-0000-0000-0000-000000000003',
  e.id,
  ROW_NUMBER() OVER (ORDER BY e.name),
  4,
  12
FROM (
  SELECT id, name FROM public.exercises 
  WHERE name ILIKE '%squat%' OR name ILIKE '%deadlift%' OR name ILIKE '%leg%' OR name ILIKE '%calf%'
  LIMIT 5
) e;


-- 5. WORKOUT SESSIONS (Yesterday and Today)
INSERT INTO public.workouts (id, user_id, routine_id, start_time, end_time)
VALUES
  (
    'c0000001-0000-0000-0000-000000000001',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'b0000001-0000-0000-0000-000000000001',
    NOW() - INTERVAL '1 day 3 hours',
    NOW() - INTERVAL '1 day 2 hours 15 minutes'
  ),
  (
    'c0000001-0000-0000-0000-000000000002',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'b0000001-0000-0000-0000-000000000002',
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '1 hour 10 minutes'
  )
ON CONFLICT (id) DO NOTHING;


-- 6. WORKOUT SETS (Links directly to the exercises in routine_exercises)
DELETE FROM public.workout_sets 
WHERE workout_id IN (
  'c0000001-0000-0000-0000-000000000001',
  'c0000001-0000-0000-0000-000000000002'
);

-- Sets for Yesterday's Push Workout
INSERT INTO public.workout_sets (id, workout_id, exercise_id, set_number, reps, weight, rpe, is_done)
SELECT 
  gen_random_uuid(),
  'c0000001-0000-0000-0000-000000000001',
  re.exercise_id,
  s.set_num,
  10 - s.set_num,
  70.0 + (s.set_num * 5),
  7.5 + (s.set_num * 0.5),
  true
FROM public.routine_exercises re
CROSS JOIN (VALUES (1), (2), (3), (4)) AS s(set_num)
WHERE re.routine_id = 'b0000001-0000-0000-0000-000000000001'
LIMIT 12;

-- Sets for Today's Pull Workout
INSERT INTO public.workout_sets (id, workout_id, exercise_id, set_number, reps, weight, rpe, is_done)
SELECT 
  gen_random_uuid(),
  'c0000001-0000-0000-0000-000000000002',
  re.exercise_id,
  s.set_num,
  12 - s.set_num,
  55.0 + (s.set_num * 5),
  7.0 + (s.set_num * 0.5),
  true
FROM public.routine_exercises re
CROSS JOIN (VALUES (1), (2), (3), (4)) AS s(set_num)
WHERE re.routine_id = 'b0000001-0000-0000-0000-000000000002'
LIMIT 12;
