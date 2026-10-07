-- SQL Migration for SET&PLATE Exercises Table (Supabase / PostgreSQL)

CREATE TABLE IF NOT EXISTS public.exercises (
    id TEXT PRIMARY KEY,
    wger_id INTEGER UNIQUE,
    name TEXT NOT NULL,
    name_es TEXT,
    category TEXT DEFAULT 'General',
    description TEXT,
    muscles TEXT[] DEFAULT '{}',
    muscles_secondary TEXT[] DEFAULT '{}',
    equipment TEXT[] DEFAULT '{}',
    aliases TEXT[] DEFAULT '{}',
    images TEXT[] DEFAULT '{}',
    muscle_images TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Search index on exercise names
CREATE INDEX IF NOT EXISTS idx_exercises_name ON public.exercises USING gin (to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_exercises_category ON public.exercises (category);

-- Enable Row Level Security (RLS)
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

-- Allow public read access to exercises
CREATE POLICY "Allow public read access to exercises"
    ON public.exercises
    FOR SELECT
    USING (true);

-- Allow authenticated users or service role to insert/update
CREATE POLICY "Allow service role full access to exercises"
    ON public.exercises
    FOR ALL
    USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');
