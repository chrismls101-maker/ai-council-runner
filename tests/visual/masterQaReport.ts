/**
 * Master QA report collector — terminal summary + JSON artifact.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { qaLog } from "./qaEnv.js";

export type SectionStatus = "pass" | "fail" | "skipped";

export interface SectionResult {
  id: string;
  label: string;
  status: SectionStatus;
  message?: string;
  details?: Record<string, unknown>;
  error?: string;
}

export interface MasterQaSummaryJson {
  timestamp: string;
  verdict: "READY FOR DAILY DRIVER TESTING" | "NOT READY — fix listed failures";
  sections: SectionResult[];
  environment: {
    appUrl: string;
    apiBase: string;
    visionEnabled: boolean;
    visionConfigured: boolean;
  };
  credits?: {
    before?: number;
    after?: number;
  };
  notes: string[];
}

const REPORT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test-results",
);
const REPORT_PATH = path.join(REPORT_DIR, "iivo-master-qa-summary.json");

export class MasterQaReport {
  readonly sections: SectionResult[] = [];
  readonly notes: string[] = [];
  visionEnabled = false;
  visionConfigured = false;
  creditsBefore?: number;
  creditsAfter?: number;

  record(section: SectionResult): void {
    const existing = this.sections.findIndex((s) => s.id === section.id);
    if (existing >= 0) {
      this.sections[existing] = section;
    } else {
      this.sections.push(section);
    }
    qaLog(`[Master QA] ${section.label}: ${section.status}${section.message ? ` — ${section.message}` : ""}`);
  }

  pass(id: string, label: string, message?: string, details?: Record<string, unknown>): void {
    this.record({ id, label, status: "pass", message, details });
  }

  fail(id: string, label: string, error: string, details?: Record<string, unknown>): void {
    this.record({ id, label, status: "fail", error, details });
  }

  skip(id: string, label: string, message: string, details?: Record<string, unknown>): void {
    this.record({ id, label, status: "skipped", message, details });
  }

  addNote(note: string): void {
    this.notes.push(note);
  }

  hasFailures(): boolean {
    return this.sections.some((s) => s.status === "fail");
  }

  failedSections(): SectionResult[] {
    return this.sections.filter((s) => s.status === "fail");
  }

  toJson(): MasterQaSummaryJson {
    return {
      timestamp: new Date().toISOString(),
      verdict: this.hasFailures()
        ? "NOT READY — fix listed failures"
        : "READY FOR DAILY DRIVER TESTING",
      sections: [...this.sections],
      environment: {
        appUrl: "http://localhost:5173",
        apiBase: "http://localhost:3001",
        visionEnabled: this.visionEnabled,
        visionConfigured: this.visionConfigured,
      },
      credits:
        this.creditsBefore !== undefined || this.creditsAfter !== undefined
          ? { before: this.creditsBefore, after: this.creditsAfter }
          : undefined,
      notes: [...this.notes],
    };
  }

  async writeJsonReport(): Promise<string> {
    await fs.mkdir(REPORT_DIR, { recursive: true });
    await fs.writeFile(REPORT_PATH, `${JSON.stringify(this.toJson(), null, 2)}\n`, "utf8");
    return REPORT_PATH;
  }

  printTerminalSummary(reportPath: string): void {
    const lines: string[] = [
      "",
      "══════════════════════════════════════════════════",
      "  IIVO Master QA Result",
      "══════════════════════════════════════════════════",
      "",
    ];

    for (const section of this.sections) {
      const icon =
        section.status === "pass" ? "PASS" : section.status === "fail" ? "FAIL" : "SKIPPED";
      lines.push(`${section.label}: ${icon}`);
      if (section.status === "fail" && section.error) {
        lines.push(`  └─ ${section.error.split("\n")[0]}`);
      } else if (section.message) {
        lines.push(`  └─ ${section.message}`);
      }
    }

    lines.push("");
    lines.push(`Verdict: ${this.toJson().verdict}`);
    lines.push(`Report: ${reportPath}`);
    lines.push("");

    console.log(lines.join("\n"));
  }
}
