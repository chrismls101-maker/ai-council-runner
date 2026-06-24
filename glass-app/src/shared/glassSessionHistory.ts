/** Shared row types for Glass session history (SQLite). */

export type SessionStatus = "active" | "archived";
export type AgentRunStatus = "pending" | "running" | "complete" | "failed";

export interface SessionRow {
  id: string;
  created_at: number;
  updated_at: number;
  title: string | null;
  context_app: string | null;
  context_url: string | null;
  agent_type: string | null;
  status: SessionStatus;
  token_count: number;
}

export interface SessionRowWithMeta extends SessionRow {
  message_count: number;
  first_message_preview: string | null;
}

export interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: number;
  agent_id: string | null;
  token_count: number;
}

export interface AgentRunRow {
  id: string;
  session_id: string;
  agent_id: string;
  run_order: number;
  status: AgentRunStatus;
  input: string | null;
  output: string | null;
  started_at: number | null;
  completed_at: number | null;
  error: string | null;
  correlation_id: string;
}

export interface UserContextRow {
  key: string;
  value: string;
  source: string;
  confidence: number;
  created_at: number;
  updated_at: number;
}
