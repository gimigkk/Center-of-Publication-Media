-- Deliverables are identified by their UUID/storage key; sequential versions are no longer used.
ALTER TABLE public.deliverables
  DROP CONSTRAINT IF EXISTS deliverables_job_version_unique;

DROP INDEX IF EXISTS public.deliverables_job_version_idx;

ALTER TABLE public.deliverables
  DROP COLUMN IF EXISTS version;
