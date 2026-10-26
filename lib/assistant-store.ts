import { mcpPool } from "./mcp-auth.js";

export type ToolEvent = { name: string; status: "ok" | "error"; detail: string };

export async function listConversations(userId: string) {
  const q = await mcpPool.query(
    `select id,title,created_at,updated_at from public.assistant_conversations
     where user_id=$1 order by updated_at desc limit 100`, [userId]);
  return q.rows;
}

export async function getConversation(userId: string, id: string) {
  const q = await mcpPool.query(
    `select id,title,created_at,updated_at from public.assistant_conversations
     where user_id=$1 and id=$2`, [userId, id]);
  return q.rows[0] || null;
}

export async function listMessages(userId: string, id: string) {
  const q = await mcpPool.query(
    `select m.id,m.role,m.content,m.tool_events,m.created_at from public.assistant_messages m
     join public.assistant_conversations c on c.id=m.conversation_id
     where c.user_id=$1 and c.id=$2 order by m.created_at,m.id limit 500`, [userId, id]);
  return q.rows;
}

export async function createConversation(userId: string, title: string) {
  const q = await mcpPool.query(
    `insert into public.assistant_conversations(user_id,title) values($1,$2)
     returning id,title,created_at,updated_at`, [userId, title.slice(0, 100)]);
  return q.rows[0];
}

export async function addMessage(id: string, role: "user" | "assistant", content: string, events: ToolEvent[] = []) {
  const q = await mcpPool.query(
    `insert into public.assistant_messages(conversation_id,role,content,tool_events)
     values($1,$2,$3,$4::jsonb) returning id,role,content,tool_events,created_at`,
    [id, role, content, JSON.stringify(events)]);
  await mcpPool.query(`update public.assistant_conversations set updated_at=now() where id=$1`, [id]);
  return q.rows[0];
}

export async function listMemories(userId: string) {
  const q = await mcpPool.query(
    `select id,content,created_at from public.assistant_memories
     where user_id=$1 order by created_at desc limit 100`, [userId]);
  return q.rows;
}

export async function addMemory(userId: string, content: string) {
  const q = await mcpPool.query(
    `insert into public.assistant_memories(user_id,content) values($1,$2)
     returning id,content,created_at`, [userId, content]);
  return q.rows[0];
}

export async function deleteMemory(userId: string, id: string) {
  await mcpPool.query(`delete from public.assistant_memories where user_id=$1 and id=$2`, [userId, id]);
}

export async function deleteConversation(userId: string, id: string) {
  await mcpPool.query(`delete from public.assistant_conversations where user_id=$1 and id=$2`, [userId, id]);
}
