drop policy "Read own reports" on public.reports;
drop policy "Read public reports" on public.reports;
create policy "Read own or public reports" on public.reports for select to authenticated
  using (user_id = (select auth.uid()) or visibility = 'public');
