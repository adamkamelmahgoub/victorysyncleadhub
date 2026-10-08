create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assistant_conversations_user_updated_idx
  on public.assistant_conversations (user_id, updated_at desc);

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  tool_events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists assistant_messages_conversation_created_idx
  on public.assistant_messages (conversation_id, created_at, id);

create table if not exists public.assistant_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists assistant_memories_user_created_idx
  on public.assistant_memories (user_id, created_at desc);

alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.assistant_memories enable row level security;
revoke all on public.assistant_conversations, public.assistant_messages, public.assistant_memories from public, anon, authenticated;
grant all on public.assistant_conversations, public.assistant_messages, public.assistant_memories to service_role;
