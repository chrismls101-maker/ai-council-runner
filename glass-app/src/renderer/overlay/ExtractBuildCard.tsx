/**
 * ExtractBuildCard — ambient chip while Extract & Build Mode is active.
 *
 * States:
 *   listening — mode on, waiting for build content in transcript
 *   detected  — BUILD → <label> with build-destination menu
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { extractBuildCardPhase } from "../../shared/extractModeLogic.ts";
import { EXTRACT_BUILD_TARGETS } from "../../shared/extractBuildHandoff.ts";
import {
  getExtractModeState,
  subscribeExtractMode,
} from "./extractModeStore.ts";
import { launchExtractBuild } from "./extractBuildLaunch.ts";
import "./ExtractBuildCard.css";

interface ExtractBuildCardProps {
  /** Opens the Extract tab in BuilderStrip */
  onOpen: () => void;
}

function useExtractMode() {
  return useSyncExternalStore(subscribeExtractMode, getExtractModeState);
}

export function ExtractBuildCard({ onOpen }: ExtractBuildCardProps): JSX.Element | null {
  const em = useExtractMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const phase = extractBuildCardPhase({
    active: em.active,
    detectedLabel: em.detectedLabel,
  });

  useEffect(() => {
    if (phase !== "detected") setMenuOpen(false);
  }, [phase]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const handleLaunch = useCallback(async (targetId: string): Promise<void> => {
    setLaunchError(null);
    setLaunching(targetId);
    try {
      const result = await launchExtractBuild(
        targetId as (typeof EXTRACT_BUILD_TARGETS)[number]["id"],
      );
      if (!result.ok) {
        setLaunchError(result.error ?? "Could not launch build");
      } else if (result.error) {
        setLaunchError(result.error);
        setMenuOpen(false);
      } else {
        setMenuOpen(false);
      }
    } finally {
      setLaunching(null);
    }
  }, []);

  if (phase === "hidden") return null;

  const busy = em.generating || launching !== null;

  if (phase === "listening") {
    return (
      <button
        type="button"
        className="ebc-card ebc-card--listening"
        onClick={onOpen}
        title="Open Extract & Build Mode"
      >
        <span className="ebc-dot" />
        <span className="ebc-prefix">BUILD</span>
        <span className="ebc-label ebc-label--listening">
          {em.detecting ? "Analyzing audio…" : "Listening for build content…"}
        </span>
      </button>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`ebc-root${menuOpen ? " ebc-root--open" : ""}`}
    >
      {menuOpen && (
        <div className="ebc-menu" role="menu" aria-label="Build destinations">
          {EXTRACT_BUILD_TARGETS.map((target) => (
            <button
              key={target.id}
              type="button"
              role="menuitem"
              className="ebc-menu-item"
              disabled={busy}
              onClick={() => void handleLaunch(target.id)}
            >
              <span className="ebc-menu-icon">{target.icon}</span>
              <span className="ebc-menu-text">
                <span className="ebc-menu-label">{target.label}</span>
                <span className="ebc-menu-hint">{target.hint}</span>
              </span>
              {launching === target.id ? (
                <span className="ebc-menu-spinner" aria-hidden />
              ) : null}
            </button>
          ))}
          <div className="ebc-menu-divider" />
          <button
            type="button"
            role="menuitem"
            className="ebc-menu-item ebc-menu-item--secondary"
            onClick={() => {
              setMenuOpen(false);
              onOpen();
            }}
          >
            <span className="ebc-menu-icon">⬡</span>
            <span className="ebc-menu-text">
              <span className="ebc-menu-label">Open panel</span>
              <span className="ebc-menu-hint">Edit transcript &amp; preview prompt</span>
            </span>
          </button>
        </div>
      )}

      <button
        type="button"
        className={`ebc-card ebc-card--detected${menuOpen ? " ebc-card--open" : ""}`}
        onClick={() => setMenuOpen((open) => !open)}
        title="Choose where to build"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        <span className="ebc-dot" />
        <span className="ebc-prefix">BUILD</span>
        <span className="ebc-arrow">→</span>
        <span className="ebc-label">{em.detectedLabel}</span>
        <span className="ebc-chevron" aria-hidden>{menuOpen ? "▴" : "▾"}</span>
      </button>

      {launchError && (
        <div className="ebc-error" role="alert">{launchError}</div>
      )}
    </div>
  );
}
