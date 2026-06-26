/**
 * Dashboard IPC — read session history from SQLite.
 */

import { ipcMain, type WebContents } from "electron";
import { IPC } from "../shared/ipc.ts";
import { getAgentRunsByCorrelation, getLastCouncilRun } from "./agentRunStore.ts";
import { getRecentSessions, getSessionMessages, getUserContext, deleteUserContextKey } from "./sessionHistoryStore.ts";
import { getSessionSpendSummary, getSessionModelCalls } from "./modelCallStore.ts";
import { getRetentionSummary } from "./glassRetentionEvents.ts";
import { agentBus } from "./agentEventBus.ts";
import { deleteAletheiaSessions } from "./aletheiaSessionStore.ts";

let isDashboardIpcSender: (sender: WebContents) => boolean = () => false;

export function setDashboardIpcAuth(check: (sender: WebContents) => boolean): void {
  isDashboardIpcSender = check;
}

export { isDashboardIpcSender };

export function registerDashboardIpc(): void {
  ipcMain.handle(IPC.getRecentSessions, (event) => {
    if (!isDashboardIpcSender(event.sender)) return [];
    try {
      return getRecentSessions(20);
    } catch (err) {
      console.error("[dashboardIpc] getRecentSessions:", err);
      return [];
    }
  });

  ipcMain.handle(IPC.getSessionMessages, (event, sessionId: unknown) => {
    if (!isDashboardIpcSender(event.sender)) return [];
    if (typeof sessionId !== "string" || !sessionId.trim()) return [];
    try {
      return getSessionMessages(sessionId.trim());
    } catch (err) {
      console.error("[dashboardIpc] getSessionMessages:", err);
      return [];
    }
  });

  ipcMain.handle(IPC.getLastCouncilRun, (event) => {
    if (!isDashboardIpcSender(event.sender)) return null;
    try {
      return getLastCouncilRun();
    } catch (err) {
      console.error("[dashboardIpc] getLastCouncilRun:", err);
      return null;
    }
  });

  ipcMain.handle(IPC.getAgentRunsByCorrelation, (event, correlationId: unknown) => {
    if (!isDashboardIpcSender(event.sender)) return [];
    if (typeof correlationId !== "string" || !correlationId.trim()) return [];
    try {
      return getAgentRunsByCorrelation(correlationId.trim());
    } catch (err) {
      console.error("[dashboardIpc] getAgentRunsByCorrelation:", err);
      return [];
    }
  });

  ipcMain.handle(IPC.getUserContext, (event) => {
    if (!isDashboardIpcSender(event.sender)) return [];
    try {
      return getUserContext();
    } catch (err) {
      console.error("[dashboardIpc] getUserContext:", err);
      return [];
    }
  });

  ipcMain.handle(IPC.deleteUserContextKey, (event, key: unknown) => {
    if (!isDashboardIpcSender(event.sender)) return { ok: false };
    if (typeof key !== "string" || !key.trim()) return { ok: false };
    try {
      return { ok: deleteUserContextKey(key.trim()) };
    } catch (err) {
      console.error("[dashboardIpc] deleteUserContextKey:", err);
      return { ok: false };
    }
  });

  ipcMain.handle(IPC.getRetentionSummary, (event) => {
    if (!isDashboardIpcSender(event.sender)) {
      return {
        sessionsLast7Days: 0,
        workflowsPerSession: 0,
        autofixAcceptanceRate: 0,
        buildLoopSuccessRate: 0,
      };
    }
    try {
      return getRetentionSummary();
    } catch (err) {
      console.error("[dashboardIpc] getRetentionSummary:", err);
      return {
        sessionsLast7Days: 0,
        workflowsPerSession: 0,
        autofixAcceptanceRate: 0,
        buildLoopSuccessRate: 0,
      };
    }
  });

  ipcMain.handle(IPC.getAgentBusHealth, (event) => {
    if (!isDashboardIpcSender(event.sender)) {
      return {
        healthy: true,
        dlqDepth: 0,
        openBreakers: [],
        heartbeatSeq: 0,
        subscribers: [],
        staleSubscribers: [],
      };
    }
    try {
      return agentBus.getHealthSnapshot();
    } catch (err) {
      console.error("[dashboardIpc] getAgentBusHealth:", err);
      return {
        healthy: false,
        dlqDepth: 0,
        openBreakers: [],
        heartbeatSeq: 0,
        subscribers: [],
        staleSubscribers: [],
      };
    }
  });

  ipcMain.handle(IPC.getSessionSpend, (event, sessionId: unknown) => {
    if (!isDashboardIpcSender(event.sender)) {
      return { summary: null, calls: [] };
    }
    if (typeof sessionId !== "string" || !sessionId.trim()) {
      return { summary: null, calls: [] };
    }
    try {
      const id = sessionId.trim();
      return {
        summary: getSessionSpendSummary(id),
        calls: getSessionModelCalls(id, 100),
      };
    } catch (err) {
      console.error("[dashboardIpc] getSessionSpend:", err);
      return { summary: null, calls: [] };
    }
  });

  /**
   * Glass Memory admin — wipe all Aletheia companion session rows.
   * GLASS DASHBOARD ONLY. This handler must never be mirrored in
   * aletheiaDashboardIpc.ts — deletion is a Glass Memory admin operation.
   */
  ipcMain.handle(IPC.deleteAletheiaSessionHistory, (event) => {
    if (!isDashboardIpcSender(event.sender)) return { ok: false };
    try {
      deleteAletheiaSessions();
      return { ok: true };
    } catch (err) {
      console.error("[dashboardIpc] deleteAletheiaSessionHistory:", err);
      return { ok: false };
    }
  });
}
