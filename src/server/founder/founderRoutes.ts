/**
 * Founder-only API routes.
 */

import type { Express, Response } from "express";
import express from "express";
import {
  FounderAuthError,
  requireFounder,
  resolveAuthenticatedUser,
} from "../auth/founderAuth.js";
import {
  getFeatureFlags,
  isFeatureFlagKey,
  updateFeatureFlags,
  type FeatureFlagKey,
} from "./featureFlags.js";
import { getFounderDashboardMetrics, getFounderGlassSummary } from "./founderMetrics.js";

function sendAuthError(res: Response, err: unknown): void {
  if (err instanceof FounderAuthError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : "Request failed";
  res.status(500).json({ error: message });
}

export function registerFounderRoutes(app: Express): void {
  app.get("/api/account/profile", async (req, res) => {
    try {
      const user = await resolveAuthenticatedUser(req);
      res.json({ ok: true, user });
    } catch (err) {
      sendAuthError(res, err);
    }
  });

  app.get("/api/founder/overview", async (req, res) => {
    try {
      await requireFounder(req);
      const overview = await getFounderDashboardMetrics();
      res.json({ ok: true, ...overview });
    } catch (err) {
      sendAuthError(res, err);
    }
  });

  app.get("/api/founder/flags", async (req, res) => {
    try {
      await requireFounder(req);
      const flags = await getFeatureFlags();
      res.json({ ok: true, flags });
    } catch (err) {
      sendAuthError(res, err);
    }
  });

  app.post("/api/founder/flags", express.json(), async (req, res) => {
    try {
      const founder = await requireFounder(req);
      const body = req.body as Record<string, unknown>;
      const patch: Partial<Record<FeatureFlagKey, boolean>> = {};

      for (const [key, value] of Object.entries(body)) {
        if (!isFeatureFlagKey(key)) continue;
        if (typeof value !== "boolean") {
          res.status(400).json({ error: `Invalid value for ${key}` });
          return;
        }
        patch[key] = value;
      }

      if (Object.keys(patch).length === 0) {
        res.status(400).json({ error: "No valid flags in body." });
        return;
      }

      const flags = await updateFeatureFlags(patch, founder.email);
      res.json({ ok: true, flags });
    } catch (err) {
      sendAuthError(res, err);
    }
  });

  app.get("/api/founder/glass-summary", async (req, res) => {
    try {
      await requireFounder(req);
      const summary = await getFounderGlassSummary();
      res.json({ ok: true, summary });
    } catch (err) {
      sendAuthError(res, err);
    }
  });
}
