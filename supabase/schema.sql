-- Run in Supabase SQL editor. pgvector dim 384 = all-MiniLM-L6-v2 (entity resolution, later step).
create extension if not exists vector;

create table if not exists notes (
  id          uuid primary key default gen_random_uuid(),
  content     text        not null,
  graph       jsonb       not null default '{}'::jsonb,   -- React Flow-ready {nodes, edges}
  room_id     text,                                       -- multiplayer room (null = personal note)
  embedding   vector(384),
  created_at  timestamptz not null default now()
);

create index if not exists notes_embedding_idx on notes using hnsw (embedding vector_cosine_ops);
create index if not exists notes_created_idx   on notes (created_at desc);
create index if not exists notes_room_idx      on notes (room_id, created_at desc);

-- Migration for a notes table created before room_id existed:
-- alter table notes add column if not exists room_id text;
-- create index if not exists notes_room_idx on notes (room_id, created_at desc);
