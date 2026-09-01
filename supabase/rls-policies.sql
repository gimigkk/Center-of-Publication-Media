-- COPM RLS hardening. Safe to re-run.

begin;

alter table public.jobs enable row level security;
alter table public.profiles enable row level security;
alter table public.pages enable row level security;
alter table public.divisions enable row level security;
alter table public.job_designers enable row level security;
alter table public.job_activity enable row level security;
alter table public.notifications enable row level security;

revoke all on public.jobs, public.profiles, public.pages, public.divisions,
  public.job_designers, public.job_activity, public.notifications,
  public.deliverables, public.login_attempts from anon;

drop policy if exists "jobs_select_authenticated" on public.jobs;
create policy "jobs_select_authenticated" on public.jobs
  for select to authenticated using (true);

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);

drop policy if exists "pages_select_authenticated" on public.pages;
create policy "pages_select_authenticated" on public.pages
  for select to authenticated using (true);

drop policy if exists "divisions_select_authenticated" on public.divisions;
create policy "divisions_select_authenticated" on public.divisions
  for select to authenticated using (true);

drop policy if exists "job_designers_select_authenticated" on public.job_designers;
create policy "job_designers_select_authenticated" on public.job_designers
  for select to authenticated using (true);

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "deliverables_select_participants" on public.deliverables;
create policy "deliverables_select_participants" on public.deliverables
  for select to authenticated
  using (
    exists (
      select 1
      from public.jobs j
      left join public.job_designers jd on jd.job_id = j.id
      where j.id = deliverables.job_id
        and (
          j.requestor_id = auth.uid()
          or j.designer_id = auth.uid()
          or jd.designer_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin'
          )
        )
    )
  );

commit;
