export type AuditEventType =
  | "app_started"
  | "run_started"
  | "run_completed"
  | "run_failed"
  | "memory_created"
  | "memory_updated"
  | "memory_deleted"
  | "outcome_saved"
  | "history_deleted"
  | "all_history_deleted"
  | "all_memory_deleted"
  | "export_history"
  | "export_memory"
  | "export_audit_log"
  | "settings_updated"
  | "decision_record_created"
  | "decision_record_updated"
  | "action_tracked"
  | "outcome_updated"
  | "decision_review_started"
  | "credits_added"
  | "credits_reset"
  | "run_blocked_insufficient_credits"
  | "usage_exported"
  | "benchmark_started"
  | "benchmark_completed"
  | "benchmark_failed"
  | "benchmark_deleted"
  | "benchmark_saved_to_memory"
  | "context_item_created"
  | "context_item_deleted";

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  eventType: AuditEventType;
  runId?: string;
  memoryId?: string;
  metadata?: string;
}

export interface AuditLogFile {
  entries: AuditLogEntry[];
}
