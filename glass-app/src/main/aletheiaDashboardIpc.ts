/**
 * aletheiaDashboardIpc.ts
 * -----------------------
 * IPC auth gate for the Aletheia dashboard.
 *
 * Mirrors the dashboardIpc.ts pattern exactly:
 *   - Only WebContents registered via `setAletheiaDashboardIpcAuth()` may
 *     receive Aletheia IPC responses. All other senders receive safe empty
 *     values — no error, no crash, no Glass-privileged data.
 *
 * Scope: Aletheia-safe read-only data only.
 * Explicitly excluded (Glass-privileged — must never surface here):
 *   - council run data          (`getLastCouncilRun`)
 *   - agent runs                (`getAgentRunsByCorrelation`)
 *   - user context write        (`deleteUserContextKey`)
 *   - spend / model call data   (`getSessionSpend`)
 *   - agent bus internals       (`getAgentBusHealth`)
 *   - API keys                  (any key surface)
 *
 * Architecture law: Aletheia presents session recap and continuity;
 * Glass owns durable memory controls, export, deletion, and admin surfaces.
 */

import { ipcMain, type WebContents } from "electron";
import { IPC } from "../shared/ipc.ts";
import { getRecentSessions, getSessionMessages } from "./sessionHistoryStore.ts";
import { getRecentAletheiaSessions } from "./aletheiaSessionStore.ts";

// ---------------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------------

let isAletheiaDashboardSender: (sender: WebContents) => boolean = () => false;

/**
 * Register the check function that determines whether a given WebContents
 * is the authenticated Aletheia dashboard. Called from main process at
 * the same point Glass dashboard IPC auth is set up.
 *
 * Pattern: set when `aletheiaDashboardActive` is true in GlassState and
 * the dashboard BrowserWindow is created; clear when it is destroyed.
 */
export function setAletheiaDashboardIpcAuth(
  check: (sender: WebContents) => boolean
): void {
  isAletheiaDashboardSender = check;
}

export { isAletheiaDashboardSender };

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

export function registerAletheiaDashboardIpc(): void {
  /**
   * Session recap — Aletheia shows recent session list for continuity context.
   * Returns last 10 sessions (not 20 like Glass) to keep scope minimal.
   * Glass-privileged fields (spend, council, agent runs) are NOT included.
   */
  ipcMain.handle(IPC.getAletheiaRecentSessions, (event) => {
    if (!isAletheiaDashboardSender(event.sender)) return [];
    try {
      return getRecentSessions(10);
    } catch (err) {
      console.error("[aletheiaDashboardIpc] getRecentSessions:", err);
      return [];
    }
  });

  /**
   * Session messages — Aletheia may surface prior conversation for continuity.
   * Same data as Glass dashboard but gated to Aletheia window only.
   */
  ipcMain.handle(IPC.getAletheiaSessionMessages, (event, sessionId: unknown) => {
    if (!isAletheiaDashboardSender(event.sender)) return [];
    if (typeof sessionId !== "string" || !sessionId.trim()) return [];
    try {
      return getSessionMessages(sessionId.trim());
    } catch (err) {
      console.error("[aletheiaDashboardIpc] getSessionMessages:", err);
      return [];
    }
  });

  /**
   * Aletheia companion session history — for the Aletheia recap panel.
   * Returns the last 20 AletheiaSessionRow entries ordered newest-first.
   * Gated to Aletheia window; does NOT include full message content.
   *
   * Architecture note: `deleteAletheiaSessionHistory` is intentionally absent
   * here — wipe is a Glass Memory admin operation (see dashboardIpc.ts).
   */
  ipcMain.handle(IPC.getAletheiaSessionHistory, (event) => {
    if (!isAletheiaDashboardSender(event.sender)) return [];
    try {
      return getRecentAletheiaSessions(20);
    } catch (err) {
      console.error("[aletheiaDashboardIpc] getAletheiaSessionHistory:", err);
      return [];
    }
  });

  // -------------------------------------------------------------------------
  // Intentionally omitted — Glass-privileged, must never appear here:
  //   IPC.getLastCouncilRun           — council/agent infrastructure
  //   IPC.getAgentRunsByCorrelation   — agent run internals
  //   IPC.getUserContext              — memory admin surface
  //   IPC.deleteUserContextKey        — destructive memory op
  //   IPC.getSessionSpend             — spend/model cost data
  //   IPC.getAgentBusHealth           — agent bus internals
  //   IPC.deleteAletheiaSessionHistory — Glass Memory admin only, not Aletheia
  // -------------------------------------------------------------------------
}
