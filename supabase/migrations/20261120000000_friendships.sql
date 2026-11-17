create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester_id <> recipient_id)
);
-- A pair can have only one pending request or friendship in either direction.
create unique index friend_requests_pair_idx on public.friend_requests
  (least(requester_id, recipient_id), greatest(requester_id, recipient_id));
create index friend_requests_recipient_idx on public.friend_requests(recipient_id);
create index friend_requests_requester_idx on public.friend_requests(requester_id);
alter table public.friend_requests enable row level security;
revoke all on public.friend_requests from public, anon, authenticated;
grant select, delete on public.friend_requests to authenticated;
grant insert(requester_id, recipient_id) on public.friend_requests to authenticated;
create policy "Read own friend relationships" on public.friend_requests for select to authenticated
  using ((select auth.uid()) in (requester_id, recipient_id));
create policy "Send own friend requests" on public.friend_requests for insert to authenticated
  with check (requester_id = (select auth.uid()));
create policy "Cancel decline or remove own relationships" on public.friend_requests for delete to authenticated
  using ((select auth.uid()) in (requester_id, recipient_id));

-- Acceptance is the only permitted update. A sender cannot accept their own request.
create function public.accept_friend_request(request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  update public.friend_requests set status = 'accepted'
    where id = request_id and recipient_id = auth.uid() and status = 'pending';
  if not found then raise exception 'This request is no longer available'; end if;
end;
$$;
revoke all on function public.accept_friend_request(uuid) from public, anon;
grant execute on function public.accept_friend_request(uuid) to authenticated;

-- Participants can see names/avatars even when neither has public sightings.
-- These policies grant no report or report-photo access.
create policy "Read friend participant names" on public.community_profiles for select to authenticated
  using (exists (select 1 from public.friend_requests f
    where (f.requester_id = auth.uid() and f.recipient_id = user_id)
       or (f.recipient_id = auth.uid() and f.requester_id = user_id)));
create policy "Read friend participant avatars" on storage.objects for select to authenticated
  using (bucket_id = 'profile-photos' and exists (
    select 1 from public.friend_requests f
    where (f.requester_id = auth.uid() and f.recipient_id::text = (storage.foldername(name))[1])
       or (f.recipient_id = auth.uid() and f.requester_id::text = (storage.foldername(name))[1])
  ));
