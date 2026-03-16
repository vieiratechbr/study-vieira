-- ============================================================
--  STUDY VIEIRA — Schema Supabase (CORRIGIDO)
-- ============================================================

create extension if not exists "uuid-ossp";

-- ─── TABELAS ─────────────────────────────────────────────────

create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  email       text unique not null,
  bio         text default '',
  avatar_url  text,
  created_at  timestamptz default now()
);

create table if not exists admins (
  email text primary key
);
insert into admins (email) values ('admin@studyvieira.com') on conflict do nothing;

create table if not exists bans (
  user_id    uuid primary key references profiles(id) on delete cascade,
  reason     text,
  banned_by  text,
  banned_at  timestamptz default now(),
  expires_at timestamptz,
  type       text
);

create table if not exists posts (
  id           uuid primary key default uuid_generate_v4(),
  title        text,
  body         text,
  img          text,
  tag          text default 'Aviso',
  pinned       boolean default false,
  author_name  text,
  author_email text,
  created_at   timestamptz default now()
);

create table if not exists communities (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  type        text default 'Escola',
  description text,
  icon        text default '🏫',
  created_by  uuid references profiles(id),
  created_at  timestamptz default now()
);

create table if not exists memberships (
  user_id       uuid references profiles(id) on delete cascade,
  community_id  uuid references communities(id) on delete cascade,
  joined_at     timestamptz default now(),
  primary key (user_id, community_id)
);

create table if not exists community_posts (
  id           uuid primary key default uuid_generate_v4(),
  community_id uuid references communities(id) on delete cascade,
  title        text,
  body         text,
  img          text,
  tag          text default 'Aviso',
  pinned       boolean default false,
  author_name  text,
  created_at   timestamptz default now()
);

create table if not exists follows (
  follower_id  uuid references profiles(id) on delete cascade,
  following_id uuid references profiles(id) on delete cascade,
  created_at   timestamptz default now(),
  primary key (follower_id, following_id)
);

create table if not exists subjects (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references profiles(id) on delete cascade,
  name        text not null,
  description text,
  color_id    text,
  color_dot   text,
  color_glow  text,
  color_tint  text,
  category    text default 'faculdade',
  created_at  timestamptz default now()
);

create table if not exists contents (
  id          uuid primary key default uuid_generate_v4(),
  subject_id  uuid references subjects(id) on delete cascade,
  title       text not null,
  type        text default 'aula',
  date        date,
  description text,
  done        boolean default false,
  created_at  timestamptz default now()
);

create table if not exists notes (
  id          uuid primary key default uuid_generate_v4(),
  subject_id  uuid references subjects(id) on delete cascade,
  title       text not null,
  body        text,
  created_at  timestamptz default now()
);

create table if not exists provas (
  id          uuid primary key default uuid_generate_v4(),
  subject_id  uuid references subjects(id) on delete cascade,
  title       text not null,
  date        date not null,
  weight      numeric,
  notes       text,
  grade       text,
  created_at  timestamptz default now()
);

-- ─── HABILITAR RLS ────────────────────────────────────────────

alter table profiles         enable row level security;
alter table admins           enable row level security;
alter table bans             enable row level security;
alter table posts            enable row level security;
alter table communities      enable row level security;
alter table memberships      enable row level security;
alter table community_posts  enable row level security;
alter table follows          enable row level security;
alter table subjects         enable row level security;
alter table contents         enable row level security;
alter table notes            enable row level security;
alter table provas           enable row level security;

-- ─── POLÍTICAS: profiles ─────────────────────────────────────

create policy "profiles_select" on profiles
  for select using (true);

create policy "profiles_insert" on profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update" on profiles
  for update using (auth.uid() = id);

-- ─── POLÍTICAS: admins ───────────────────────────────────────

create policy "admins_select" on admins
  for select using (true);

create policy "admins_insert" on admins
  for insert with check (
    auth.email() = 'admin@studyvieira.com' or
    exists (select 1 from admins where email = auth.email())
  );

create policy "admins_delete" on admins
  for delete using (
    auth.email() = 'admin@studyvieira.com' or
    exists (select 1 from admins where email = auth.email())
  );

-- ─── POLÍTICAS: bans ─────────────────────────────────────────

create policy "bans_select" on bans
  for select using (true);

create policy "bans_insert" on bans
  for insert with check (
    auth.email() = 'admin@studyvieira.com' or
    exists (select 1 from admins where email = auth.email())
  );

create policy "bans_update" on bans
  for update using (
    auth.email() = 'admin@studyvieira.com' or
    exists (select 1 from admins where email = auth.email())
  );

create policy "bans_delete" on bans
  for delete using (
    auth.email() = 'admin@studyvieira.com' or
    exists (select 1 from admins where email = auth.email())
  );

-- ─── POLÍTICAS: posts (avisos globais) ───────────────────────

create policy "posts_select" on posts
  for select using (true);

create policy "posts_insert" on posts
  for insert with check (
    auth.email() = 'admin@studyvieira.com' or
    exists (select 1 from admins where email = auth.email())
  );

create policy "posts_update" on posts
  for update using (
    auth.email() = 'admin@studyvieira.com' or
    exists (select 1 from admins where email = auth.email())
  );

create policy "posts_delete" on posts
  for delete using (
    auth.email() = 'admin@studyvieira.com' or
    exists (select 1 from admins where email = auth.email())
  );

-- ─── POLÍTICAS: communities ──────────────────────────────────

create policy "communities_select" on communities
  for select using (true);

create policy "communities_insert" on communities
  for insert with check (
    auth.email() = 'admin@studyvieira.com' or
    exists (select 1 from admins where email = auth.email())
  );

create policy "communities_update" on communities
  for update using (
    auth.email() = 'admin@studyvieira.com' or
    exists (select 1 from admins where email = auth.email())
  );

create policy "communities_delete" on communities
  for delete using (
    auth.email() = 'admin@studyvieira.com' or
    exists (select 1 from admins where email = auth.email())
  );

-- ─── POLÍTICAS: memberships ──────────────────────────────────

create policy "memberships_select" on memberships
  for select using (true);

create policy "memberships_insert" on memberships
  for insert with check (auth.uid() = user_id);

create policy "memberships_delete" on memberships
  for delete using (auth.uid() = user_id);

-- ─── POLÍTICAS: community_posts ──────────────────────────────

create policy "cposts_select" on community_posts
  for select using (
    exists (
      select 1 from memberships m
      where m.community_id = community_posts.community_id
        and m.user_id = auth.uid()
    )
    or auth.email() = 'admin@studyvieira.com'
    or exists (select 1 from admins where email = auth.email())
  );

create policy "cposts_insert" on community_posts
  for insert with check (
    auth.email() = 'admin@studyvieira.com' or
    exists (select 1 from admins where email = auth.email())
  );

create policy "cposts_update" on community_posts
  for update using (
    auth.email() = 'admin@studyvieira.com' or
    exists (select 1 from admins where email = auth.email())
  );

create policy "cposts_delete" on community_posts
  for delete using (
    auth.email() = 'admin@studyvieira.com' or
    exists (select 1 from admins where email = auth.email())
  );

-- ─── POLÍTICAS: follows ──────────────────────────────────────

create policy "follows_select" on follows
  for select using (true);

create policy "follows_insert" on follows
  for insert with check (auth.uid() = follower_id);

create policy "follows_delete" on follows
  for delete using (auth.uid() = follower_id);

-- ─── POLÍTICAS: subjects ─────────────────────────────────────

create policy "subjects_select" on subjects
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from follows f1
      join follows f2
        on f1.following_id = f2.follower_id
        and f1.follower_id = f2.following_id
      where f1.follower_id = auth.uid()
        and f1.following_id = subjects.user_id
    )
  );

create policy "subjects_insert" on subjects
  for insert with check (user_id = auth.uid());

create policy "subjects_update" on subjects
  for update using (user_id = auth.uid());

create policy "subjects_delete" on subjects
  for delete using (user_id = auth.uid());

-- ─── POLÍTICAS: contents ─────────────────────────────────────

create policy "contents_select" on contents
  for select using (
    exists (
      select 1 from subjects s where s.id = contents.subject_id
      and (
        s.user_id = auth.uid()
        or exists (
          select 1 from follows f1
          join follows f2
            on f1.following_id = f2.follower_id
            and f1.follower_id = f2.following_id
          where f1.follower_id = auth.uid()
            and f1.following_id = s.user_id
        )
      )
    )
  );

create policy "contents_insert" on contents
  for insert with check (
    exists (select 1 from subjects s where s.id = contents.subject_id and s.user_id = auth.uid())
  );

create policy "contents_update" on contents
  for update using (
    exists (select 1 from subjects s where s.id = contents.subject_id and s.user_id = auth.uid())
  );

create policy "contents_delete" on contents
  for delete using (
    exists (select 1 from subjects s where s.id = contents.subject_id and s.user_id = auth.uid())
  );

-- ─── POLÍTICAS: notes ────────────────────────────────────────

create policy "notes_select" on notes
  for select using (
    exists (
      select 1 from subjects s where s.id = notes.subject_id
      and (
        s.user_id = auth.uid()
        or exists (
          select 1 from follows f1
          join follows f2
            on f1.following_id = f2.follower_id
            and f1.follower_id = f2.following_id
          where f1.follower_id = auth.uid()
            and f1.following_id = s.user_id
        )
      )
    )
  );

create policy "notes_insert" on notes
  for insert with check (
    exists (select 1 from subjects s where s.id = notes.subject_id and s.user_id = auth.uid())
  );

create policy "notes_update" on notes
  for update using (
    exists (select 1 from subjects s where s.id = notes.subject_id and s.user_id = auth.uid())
  );

create policy "notes_delete" on notes
  for delete using (
    exists (select 1 from subjects s where s.id = notes.subject_id and s.user_id = auth.uid())
  );

-- ─── POLÍTICAS: provas ───────────────────────────────────────

create policy "provas_select" on provas
  for select using (
    exists (
      select 1 from subjects s where s.id = provas.subject_id
      and (
        s.user_id = auth.uid()
        or exists (
          select 1 from follows f1
          join follows f2
            on f1.following_id = f2.follower_id
            and f1.follower_id = f2.following_id
          where f1.follower_id = auth.uid()
            and f1.following_id = s.user_id
        )
      )
    )
  );

create policy "provas_insert" on provas
  for insert with check (
    exists (select 1 from subjects s where s.id = provas.subject_id and s.user_id = auth.uid())
  );

create policy "provas_update" on provas
  for update using (
    exists (select 1 from subjects s where s.id = provas.subject_id and s.user_id = auth.uid())
  );

create policy "provas_delete" on provas
  for delete using (
    exists (select 1 from subjects s where s.id = provas.subject_id and s.user_id = auth.uid())
  );

-- ─── STORAGE: bucket de avatares ─────────────────────────────

insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict do nothing;

create policy "avatars_read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_insert" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "avatars_update" on storage.objects
  for update using (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "avatars_delete" on storage.objects
  for delete using (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  );