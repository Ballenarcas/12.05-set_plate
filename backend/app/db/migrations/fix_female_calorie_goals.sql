-- Corrects calorie goals saved while women were given the male formula.
--
-- Only goals that exactly match the wrong formula change, so a goal the user changed by
-- accepting an adjustment stays as it is. Running it twice changes nothing.

WITH profile AS (
  SELECT
    id,
    calorie_goal,
    10 * coalesce(nullif(weight, 0), 75)::numeric
      + 6.25 * coalesce(nullif(height, 0), 175)::numeric
      - 5 * coalesce(nullif(age, 0), 25)::numeric AS base,
    CASE
      WHEN lower(coalesce(objective, '')) LIKE '%lose%' OR lower(coalesce(objective, '')) LIKE '%loss%' THEN -500
      WHEN lower(coalesce(objective, '')) LIKE '%hypertrophy%' THEN 400
      WHEN lower(coalesce(objective, '')) LIKE '%strength%' THEN 250
      ELSE 0
    END AS goal_change
  FROM public.users
  WHERE lower(gender) LIKE '%female%'
)
UPDATE public.users AS target
SET calorie_goal = greatest(1200, least(5000, round((profile.base - 161) * 1.25 + profile.goal_change)))
FROM profile
WHERE target.id = profile.id
  AND abs(profile.calorie_goal - greatest(1200, least(5000, (profile.base + 5) * 1.25 + profile.goal_change))) <= 1;
