-- ═══════════════════════════════════════════════════════
-- Chat Advisor: threads, messages, memories
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════

-- 1. Chat threads (conversations)
create table if not exists chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text,
  map_id uuid references maps(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table chat_threads enable row level security;
create policy "Users see own threads" on chat_threads for select using (auth.uid() = user_id);
create policy "Users insert own threads" on chat_threads for insert with check (auth.uid() = user_id);
create policy "Users update own threads" on chat_threads for update using (auth.uid() = user_id);
create policy "Users delete own threads" on chat_threads for delete using (auth.uid() = user_id);

-- 2. Chat messages
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references chat_threads(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  image_url text,
  web_sources jsonb,
  created_at timestamptz default now()
);

alter table chat_messages enable row level security;
create policy "Users see own messages" on chat_messages for select
  using (exists (select 1 from chat_threads where chat_threads.id = chat_messages.thread_id and chat_threads.user_id = auth.uid()));
create policy "Users insert own messages" on chat_messages for insert
  with check (exists (select 1 from chat_threads where chat_threads.id = chat_messages.thread_id and chat_threads.user_id = auth.uid()));

-- 3. Chat memories (long-term recall)
create table if not exists chat_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  thread_id uuid references chat_threads(id) on delete set null,
  summary text not null,
  created_at timestamptz default now()
);

alter table chat_memories enable row level security;
create policy "Users see own memories" on chat_memories for select using (auth.uid() = user_id);
create policy "Users insert own memories" on chat_memories for insert with check (auth.uid() = user_id);

-- 4. Indexes
create index if not exists idx_chat_threads_user on chat_threads(user_id);
create index if not exists idx_chat_messages_thread on chat_messages(thread_id);
create index if not exists idx_chat_memories_user on chat_memories(user_id);

-- 5. Storage bucket for chat images
insert into storage.buckets (id, name, public)
values ('chat-images', 'chat-images', true)
on conflict (id) do nothing;

create policy "Users upload chat images" on storage.objects for insert
  with check (bucket_id = 'chat-images' and auth.role() = 'authenticated');
create policy "Public read chat images" on storage.objects for select
  using (bucket_id = 'chat-images');
