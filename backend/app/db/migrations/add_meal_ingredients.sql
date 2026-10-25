CREATE TABLE IF NOT EXISTS public.meal_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meal_id UUID NOT NULL REFERENCES public.meals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    meal_type TEXT NOT NULL DEFAULT 'Meal',
    name TEXT NOT NULL,
    quantity_g NUMERIC NOT NULL CHECK (quantity_g > 0),
    calories_per_100g NUMERIC NOT NULL CHECK (calories_per_100g >= 0),
    proteins_per_100g NUMERIC NOT NULL DEFAULT 0 CHECK (proteins_per_100g >= 0),
    carbs_per_100g NUMERIC NOT NULL DEFAULT 0 CHECK (carbs_per_100g >= 0),
    fats_per_100g NUMERIC NOT NULL DEFAULT 0 CHECK (fats_per_100g >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS meal_ingredients_meal_id_idx
    ON public.meal_ingredients (meal_id);

ALTER TABLE public.meal_ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can access meal ingredients" ON public.meal_ingredients;
CREATE POLICY "Users can access meal ingredients"
    ON public.meal_ingredients
    FOR ALL
    USING (auth.role() = 'service_role' OR user_id = auth.uid())
    WITH CHECK (auth.role() = 'service_role' OR user_id = auth.uid());
