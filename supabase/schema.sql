-- ==========================================
-- COPM Platform - Complete Supabase SQL Schema
-- ==========================================

-- 1. Create Enums
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('requestor', 'designer', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('in_queue', 'wip', 'revisions', 'done');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE deliverable_status AS ENUM ('pending', 'ready');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Divisions Table
CREATE TABLE IF NOT EXISTS public.divisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. Profiles Table (Mirrors Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    phone_number TEXT,
    role user_role DEFAULT 'requestor'::user_role NOT NULL,
    division_id UUID REFERENCES public.divisions(id) ON DELETE SET NULL,
    is_approved BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 4. Login Attempt Diagnostics (no passwords, tokens, or auth headers)
CREATE TABLE IF NOT EXISTS public.login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    correlation_id UUID NOT NULL,
    email TEXT NOT NULL,
    stage TEXT NOT NULL,
    status TEXT NOT NULL,
    error_code TEXT,
    error_message TEXT,
    provider_status INTEGER,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS login_attempts_correlation_id_idx
    ON public.login_attempts (correlation_id);
CREATE INDEX IF NOT EXISTS login_attempts_email_created_at_idx
    ON public.login_attempts (email, created_at DESC);
CREATE INDEX IF NOT EXISTS login_attempts_status_created_at_idx
    ON public.login_attempts (status, created_at DESC);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- No public policies: attempts are written by the trusted server connection
-- and must not be readable directly by browser clients.

-- 5. Pages Table (FigJam style workspaces)
CREATE TABLE IF NOT EXISTS public.pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_by UUID REFERENCES public.profiles(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 5. Jobs Table
CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID REFERENCES public.pages(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    brief_link TEXT NOT NULL,
    brief_title TEXT,
    division_id UUID REFERENCES public.divisions(id) NOT NULL,
    publication_media TEXT NOT NULL,
    deadline TIMESTAMPTZ NOT NULL,
    status job_status DEFAULT 'in_queue'::job_status NOT NULL,
    kanban_order INTEGER DEFAULT 0 NOT NULL,
    requestor_id UUID REFERENCES public.profiles(id) NOT NULL,
    designer_id UUID REFERENCES public.profiles(id),
    is_archived BOOLEAN DEFAULT false NOT NULL,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 6. Deliverables Table (private files are stored in Cloudflare R2)
CREATE TABLE IF NOT EXISTS public.deliverables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
    version INTEGER NOT NULL,
    storage_key TEXT UNIQUE NOT NULL,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    uploaded_by UUID REFERENCES public.profiles(id) NOT NULL,
    status deliverable_status DEFAULT 'pending'::deliverable_status NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    registered_at TIMESTAMPTZ,
    CONSTRAINT deliverables_job_version_unique UNIQUE (job_id, version)
);

CREATE INDEX IF NOT EXISTS deliverables_job_id_idx ON public.deliverables (job_id);
CREATE INDEX IF NOT EXISTS deliverables_uploader_id_idx ON public.deliverables (uploaded_by);

ALTER TABLE public.deliverables ENABLE ROW LEVEL SECURITY;

-- Browser clients never access deliverables directly. Server actions use Drizzle.

-- 7. Job Activity Log Table
CREATE TABLE IF NOT EXISTS public.job_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
    actor_id UUID REFERENCES public.profiles(id) NOT NULL,
    from_status job_status,
    to_status job_status NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 8. Realtime Enablement
ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.deliverables;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- 8. Storage bucket for required Avatars
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Public access policies for avatars storage
CREATE POLICY "Public Avatar Access" ON storage.objects
FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated Users Avatar Upload" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Avatar Update Own" ON storage.objects
FOR UPDATE USING (bucket_id = 'avatars');

-- 9. Initial Seed Data (Default Divisions)
INSERT INTO public.divisions (name) VALUES 
    ('Marketing & Social Media'),
    ('Brand & Visual Identity'),
    ('Public Relations & Events'),
    ('Product & Growth'),
    ('Executive & Operations')
ON CONFLICT (name) DO NOTHING;
