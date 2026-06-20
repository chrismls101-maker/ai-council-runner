/**
 * Extract & Build Mode Panel — Builder Strip tab.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { EXTRACT_BUILD_TARGETS } from "../../shared/extractBuildHandoff.ts";
import { send } from "../useGlassState.ts";
import { launchExtractBuild } from "../overlay/extractBuildLaunch.ts";
import {
  getExtractModeState,
  setExtractModeState,
  resetExtractModeState,
  subscribeExtractMode,
} from "../overlay/extractModeStore.ts";
import "./ExtractModePanel.css";

function useExtractMode() {
  return useSyncExternalStore(subscribeExtractMode, getExtractModeState);
}

interface ExtractModePanelProps {
  onClose: () => void;
}

export function ExtractModePanel({ onClose }: ExtractModePanelProps): JSX.Element {
  const em = useExtractMode();
  const [copied, setCopied] = useState(false);
  const [sentToGlass, setSentToGlass] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLTextAreaElement>(null);

  const handleToggle = useCallback((): void => {
    if (em.active) {
      send({ type: "extract-mode-stop" });
      setExtractModeState({ active: false });
    } else {
      resetExtractModeState();
      setExtractModeState({ active: true });
      send({ type: "extract-mode-start" });
      setError(null);
    }
  }, [em.active]);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [em.transcript]);

  const handleGenerate = useCallback(async (): Promise<void> => {
    const current = getExtractModeState();
    if (!current.transcript.trim()) {
      setError("No transcript yet — play a video or podcast with a build walkthrough, or paste a transcript.");
      return;
    }
    setError(null);
    setExtractModeState({ generating: true, masterPrompt: null });
    try {
      const res = await window.glass.extractGenerate({
        transcript: current.transcript,
        detectedLabel: current.detectedLabel ?? undefined,
      });
      if (res.error) {
        setError(res.error);
        setExtractModeState({ generating: false });
      } else {
        setExtractModeState({ generating: false, masterPrompt: res.prompt ?? "" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setExtractModeState({ generating: false });
    }
  }, []);

  const handleCopy = useCallback(async (): Promise<void> => {
    if (!em.masterPrompt) return;
    try {
      await window.glass.writeClipboard(em.masterPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [em.masterPrompt]);

  const handleSendToGlass = useCallback((): void => {
    if (!em.masterPrompt) return;
    send({ type: "prefill-command-bar", text: em.masterPrompt });
    setSentToGlass(true);
    setTimeout(() => setSentToGlass(false), 2500);
  }, [em.masterPrompt]);

  const handleBuildLaunch = useCallback(async (targetId: string): Promise<void> => {
    setError(null);
    setLaunching(targetId);
    try {
      const result = await launchExtractBuild(
        targetId as (typeof EXTRACT_BUILD_TARGETS)[number]["id"],
      );
      if (!result.ok) {
        setError(result.error ?? "Could not launch build");
      } else if (result.error) {
        setError(result.error);
      }
    } finally {
      setLaunching(null);
    }
  }, []);

  const handleClear = useCallback((): void => {
    const wasActive = getExtractModeState().active;
    resetExtractModeState();
    setError(null);
    if (wasActive) send({ type: "extract-mode-stop" });
  }, []);

  const handleTranscriptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setExtractModeState({ transcript: e.target.value });
  }, []);

  return (
    <div className="em-panel">
      <div className="em-header">
        <div className="em-title">
          <span className="em-title-icon">⬡</span>
          Extract &amp; Build Mode
        </div>
        <div className="em-header-actions">
          <button
            type="button"
            className={`em-toggle${em.active ? " em-toggle--active" : ""}`}
            onClick={handleToggle}
            title={em.active ? "Stop system-audio capture" : "Start system-audio capture"}
          >
            {em.active ? "● LIVE" : "○ START"}
          </button>
          <button type="button" className="em-btn-close" onClick={onClose} title="Close">✕</button>
        </div>
      </div>

      <div className="em-body">
        <p className="em-description">
          Hit <strong>START</strong> and play any video, podcast, or call where someone explains how to
          build something. Glass captures system audio, detects the topic, then turns it into a master
          build prompt you can paste into Cursor.
        </p>

        {em.detectedLabel && (
          <div className="em-detection-badge">
            <span className="em-detection-dot" />
            <span className="em-detection-text">
              Detected: <strong>{em.detectedLabel}</strong>
            </span>
          </div>
        )}

        {em.detectedLabel && (
          <div className="em-build-destinations">
            <div className="em-build-destinations-label">Ready to build</div>
            <div className="em-build-destinations-row">
              {EXTRACT_BUILD_TARGETS.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  className={`em-build-btn${launching === target.id ? " em-build-btn--loading" : ""}`}
                  disabled={!!launching || em.generating || !em.transcript.trim()}
                  title={target.hint}
                  onClick={() => void handleBuildLaunch(target.id)}
                >
                  <span className="em-build-btn-icon">{target.icon}</span>
                  {launching === target.id || em.generating ? "Preparing…" : target.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="em-field-label">
          Transcript
          <span className="em-field-hint">
            {em.active ? (em.detecting ? "analyzing…" : "listening…") : "paste or type"}
          </span>
        </div>
        <textarea
          ref={transcriptRef}
          className="em-transcript"
          value={em.transcript}
          onChange={handleTranscriptChange}
          placeholder={
            em.active
              ? "Transcript fills automatically from system audio…"
              : "Press START to capture system audio, or paste a transcript"
          }
          rows={6}
        />

        {error && <div className="em-error">{error}</div>}

        <button
          type="button"
          className={`em-btn-generate${em.generating ? " em-btn-generate--loading" : ""}`}
          onClick={() => void handleGenerate()}
          disabled={em.generating || !em.transcript.trim()}
        >
          {em.generating ? (
            <>
              <span className="em-spinner" />
              Generating…
            </>
          ) : (
            <>
              <span className="em-btn-icon">◆</span>
              Generate Master Prompt
            </>
          )}
        </button>

        {em.masterPrompt && (
          <div className="em-output">
            <div className="em-output-header">
              <span className="em-output-label">Master Build Prompt</span>
              <div className="em-output-actions">
                <button
                  type="button"
                  className={`em-btn-copy${copied ? " em-btn-copy--done" : ""}`}
                  onClick={() => void handleCopy()}
                >
                  {copied ? "✓ Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  className={`em-btn-send${sentToGlass ? " em-btn-send--done" : ""}`}
                  onClick={handleSendToGlass}
                >
                  {sentToGlass ? "✓ In Glass" : "Send to Glass"}
                </button>
              </div>
            </div>
            <pre className="em-output-text">{em.masterPrompt}</pre>
          </div>
        )}

        {(em.transcript || em.masterPrompt || em.detectedLabel) && !em.active && (
          <button type="button" className="em-btn-clear" onClick={handleClear}>
            Clear session
          </button>
        )}
      </div>
    </div>
  );
}
