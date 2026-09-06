-- Give the caregiver view a real credential instead of a row id.
--
-- WHY
-- /caregiver-view/[token] looked the shift up by `id = token`. A UUID is an
-- identifier, not a credential: it is not secret, it appears in logs and exports,
-- it never expires and it cannot be revoked — and the identical value sits in the
-- family's own /caregiver/shifts/<id> URL.
--
-- It also did not work. Every policy on caregiver_shifts, shift_briefs and
-- shift_recaps requires fn_user_in_family(...), and the public page uses the anon
-- client, so a caregiver opening that link got nothing back and a 404. Probed
-- rather than inferred: anon read of the shift returned null, anon read of the
-- brief returned null, and an anon recap insert was refused by RLS. The feature
-- has never worked for the person it exists for.
--
-- So this is not only a hardening change. It is the first time a caregiver can
-- read a brief or send a recap at all.
--
-- WHAT
-- baby_share_links already implements the correct pattern in production — a
-- 256-bit token, an expiry, a revocation column, a scope and a view counter, with
-- fn_share_read taking the token as its ONLY argument. Reused rather than
-- reinvented. (The table keeps its baby_ name; renaming a live table to gain a
-- prefix is not worth the migration.)
--
-- RLS IS NOT TOUCHED. Nothing becomes anon-readable. The two SECURITY DEFINER
-- functions below are the only door, and the token is the only key.
--
-- NOT APPLIED. Production DDL, so it waits for an explicit go like the last one.

-- ── 1. A share link can point at a shift ─────────────────────────────────────

alter table public.baby_share_links
  add column shift_id uuid references public.caregiver_shifts(id) on delete cascade;

alter table public.baby_share_links
  drop constraint baby_share_links_scope_check,
  add constraint baby_share_links_scope_check
    check (scope = any (array['contractions', 'baby_today', 'caregiver_shift']));

-- A shift scope needs a shift, and the other scopes must not carry one. Written
-- as an equivalence so neither half can drift.
alter table public.baby_share_links
  add constraint baby_share_links_shift_scope
    check ((scope = 'caregiver_shift') = (shift_id is not null));

create index idx_share_links_shift on public.baby_share_links (shift_id)
  where shift_id is not null;

-- ── 2. fn_share_create learns about shifts ───────────────────────────────────
-- Dropped and recreated rather than overloaded: adding a defaulted parameter
-- leaves the old four-argument function in place, and a four-argument named call
-- would then match both and fail as ambiguous.

drop function if exists public.fn_share_create(uuid, text, text, integer);

create function public.fn_share_create(
  p_family_id uuid,
  p_label text,
  p_scope text,
  p_hours integer default 24,
  p_shift_id uuid default null
)
returns table(token text, expires_at timestamp with time zone)
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare t text;
begin
  -- Not SECURITY DEFINER, deliberately: the INSERT below is checked by the
  -- table's own RLS policy, so a caller can only mint links for their own family.
  -- The shift is verified against that same family id rather than trusted, or a
  -- member of family A could mint a working link to family B's shift by passing
  -- their own family_id alongside someone else's shift.
  if p_scope = 'caregiver_shift' then
    if p_shift_id is null then
      raise exception 'a caregiver_shift link needs a shift id'
        using errcode = 'invalid_parameter_value';
    end if;
    if not exists (
      select 1 from public.caregiver_shifts s
       where s.id = p_shift_id and s.family_id = p_family_id
    ) then
      raise exception 'shift % does not belong to that family', p_shift_id
        using errcode = 'invalid_parameter_value';
    end if;
  elsif p_shift_id is not null then
    raise exception 'only a caregiver_shift link carries a shift id'
      using errcode = 'invalid_parameter_value';
  end if;

  -- 256 bits. gen_random_uuid() is CSPRNG-backed; two of them concatenated is
  -- not guessable and needs no extension.
  t := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');

  return query
  insert into public.baby_share_links
    (family_id, token, label, scope, window_hours, expires_at, created_by_user_id, shift_id)
  values (p_family_id, t, p_label, p_scope, p_hours,
          now() + make_interval(hours => p_hours), auth.uid(), p_shift_id)
  returning baby_share_links.token, baby_share_links.expires_at;
end $function$;

grant execute on function public.fn_share_create(uuid, text, text, integer, uuid)
  to authenticated;

-- ── 3. Reading a shift by token ──────────────────────────────────────────────

create or replace function public.fn_share_read_shift(p_token text)
returns table(
  label text,
  caregiver_name text,
  caregiver_role text,
  kid_names text[],
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  brief_content text,
  brief_generated_at timestamp with time zone,
  recap_transcription text,
  recap_submitted_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare s record;
begin
  -- THE TOKEN IS THE ONLY INPUT, exactly as in fn_share_read. No family id and no
  -- shift id: a caller-supplied identifier on a SECURITY DEFINER function
  -- reachable by anon is what made fn_grocery_upsert writable across households.
  select * into s from public.baby_share_links l
   where l.token = p_token
     and l.scope = 'caregiver_shift'
     and l.revoked_at is null
     and l.expires_at > now();

  -- One exception for not-found, expired and revoked alike, so the page cannot
  -- be used to confirm which tokens ever existed.
  if not found then
    raise exception 'link not found, expired, or revoked'
      using errcode = 'insufficient_privilege';
  end if;

  update public.baby_share_links
     set view_count = view_count + 1, last_viewed_at = now()
   where id = s.id;

  return query
  select s.label,
         c.name,
         c.role::text,
         sh.kid_names,
         sh.start_at,
         sh.end_at,
         b.content,
         b.generated_at,
         r.transcription,
         r.submitted_at
    from public.caregiver_shifts sh
    join public.caregivers c on c.id = sh.caregiver_id
    left join public.shift_briefs b on b.shift_id = sh.id
    left join public.shift_recaps r on r.shift_id = sh.id
   where sh.id = s.shift_id;
end $function$;

grant execute on function public.fn_share_read_shift(text) to anon, authenticated;

-- ── 4. Submitting a recap by token ───────────────────────────────────────────
-- The half that has never worked: RLS refuses an anon insert into shift_recaps,
-- so the "How did it go?" form on the public page could not save anything.

create or replace function public.fn_share_submit_recap(p_token text, p_text text)
returns timestamp with time zone
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare s record; existing_id uuid; submitted timestamp with time zone;
begin
  select * into s from public.baby_share_links l
   where l.token = p_token
     and l.scope = 'caregiver_shift'
     and l.revoked_at is null
     and l.expires_at > now();

  if not found then
    raise exception 'link not found, expired, or revoked'
      using errcode = 'insufficient_privilege';
  end if;

  if p_text is null or btrim(p_text) = '' then
    raise exception 'a recap needs some text' using errcode = 'invalid_parameter_value';
  end if;

  -- Bounded on purpose. This is the one write anon can reach, so it gets a
  -- ceiling: an expiring token is not a reason to accept an unbounded blob.
  if length(p_text) > 5000 then
    raise exception 'recap is too long (5000 characters maximum)'
      using errcode = 'invalid_parameter_value';
  end if;

  -- One recap per shift, replaced rather than appended, so a token cannot be used
  -- to accumulate rows for as long as it lives.
  select r.id into existing_id from public.shift_recaps r where r.shift_id = s.shift_id;

  if existing_id is not null then
    update public.shift_recaps
       set transcription = btrim(p_text), submitted_at = now(), structured_log = null
     where id = existing_id
    returning submitted_at into submitted;
  else
    insert into public.shift_recaps (shift_id, transcription, submitted_at)
    values (s.shift_id, btrim(p_text), now())
    returning submitted_at into submitted;
  end if;

  return submitted;
end $function$;

grant execute on function public.fn_share_submit_recap(text, text) to anon, authenticated;

-- ── Rollback ─────────────────────────────────────────────────────────────────
--   drop function if exists public.fn_share_submit_recap(text, text);
--   drop function if exists public.fn_share_read_shift(text);
--   drop function if exists public.fn_share_create(uuid, text, text, integer, uuid);
--   create function public.fn_share_create(uuid, text, text, integer) ... -- prior body
--   drop index if exists public.idx_share_links_shift;
--   alter table public.baby_share_links drop constraint baby_share_links_shift_scope;
--   alter table public.baby_share_links
--     drop constraint baby_share_links_scope_check,
--     add constraint baby_share_links_scope_check
--       check (scope = any (array['contractions','baby_today']));
--   alter table public.baby_share_links drop column shift_id;   -- drops any shift links
