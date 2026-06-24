import { useCallback, useEffect, useRef, useState } from "react";
import type { GlassState } from "../../shared/ipc.ts";
import { normalizePreviewUrl } from "../../shared/glassIdePreview.ts";
import { GlassHoverTooltip } from "../components/GlassHoverTooltip.tsx";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";
import "./GlassIdePreview.css";

interface GlassIdePreviewProps {
  state: GlassState;
}

export function GlassIdePreview({ state }: GlassIdePreviewProps): JSX.Element {
  const webviewRef = useRef<HTMLElement>(null);
  const [draftUrl, setDraftUrl] = useState(state.glassIdePreviewUrl ?? "");
  const activeUrl = state.glassIdePreviewUrl?.trim() || "";

  useEffect(() => {
    setDraftUrl(state.glassIdePreviewUrl ?? "");
  }, [state.glassIdePreviewUrl]);

  useEffect(() => {
    const el = webviewRef.current as (HTMLElement & { reload?: () => void }) | null;
    if (!el || !activeUrl) return;
    const nonce = state.glassIdePreviewReloadNonce ?? 0;
    if (nonce === 0) return;
    try {
      el.reload?.();
    } catch {
      // webview not ready yet
    }
  }, [state.glassIdePreviewReloadNonce, activeUrl]);

  useEffect(() => {
    return window.glass.onIdePreviewProbe(() => {
      void (async () => {
        const el = webviewRef.current as (HTMLElement & {
          executeJavaScript?: (code: string) => Promise<unknown>;
        }) | null;
        if (!el?.executeJavaScript || !activeUrl) {
          window.glass.idePreviewProbeResult({ skipped: true });
          return;
        }
        try {
          const result = await el.executeJavaScript(`
            (function() {
              return new Promise((resolve) => {
                const errors = [];
                const unhandledRejections = [];
                const networkErrors = [];
                const bootStart = Date.now();
                const BOOT_TIMEOUT_MS = 8000;

                const origError = console.error.bind(console);
                console.error = function(...args) {
                  errors.push(args.map(String).join(' '));
                  origError(...args);
                };

                window.addEventListener('error', (e) => {
                  if (e.message) errors.push(String(e.message));
                });

                window.addEventListener('unhandledrejection', (e) => {
                  const reason = e.reason instanceof Error ? e.reason.message : String(e.reason ?? 'rejection');
                  unhandledRejections.push(reason);
                });

                try {
                  const observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                      const res = entry;
                      if (res.initiatorType === 'fetch' || res.initiatorType === 'xmlhttprequest') {
                        const status = res.responseStatus || 0;
                        if (status >= 400) {
                          networkErrors.push(String(status) + ' ' + String(res.name || 'request'));
                        }
                      }
                    }
                  });
                  observer.observe({ type: 'resource', buffered: true });
                } catch (_) {}

                const finish = () => {
                  const body = document.body;
                  const blankScreen = Boolean(body && body.children.length === 0 && body.textContent.trim().length < 8);
                  resolve({
                    errors: errors.slice(0, 20),
                    unhandledRejections: unhandledRejections.slice(0, 10),
                    networkErrors: networkErrors.slice(0, 10),
                    bootTimedOut: Date.now() - bootStart > BOOT_TIMEOUT_MS,
                    blankScreen,
                  });
                };

                setTimeout(finish, 3000);
                setTimeout(() => resolve({
                  errors: errors.slice(0, 20),
                  unhandledRejections: unhandledRejections.slice(0, 10),
                  networkErrors: networkErrors.slice(0, 10),
                  bootTimedOut: true,
                  blankScreen: true,
                }), BOOT_TIMEOUT_MS);
              });
            })()
          `) as {
            errors?: string[];
            unhandledRejections?: string[];
            networkErrors?: string[];
            bootTimedOut?: boolean;
            blankScreen?: boolean;
          };
          window.glass.idePreviewProbeResult({
            errors: Array.isArray(result?.errors)
              ? result.errors.filter((e): e is string => typeof e === "string")
              : [],
            unhandledRejections: Array.isArray(result?.unhandledRejections)
              ? result.unhandledRejections.filter((e): e is string => typeof e === "string")
              : [],
            networkErrors: Array.isArray(result?.networkErrors)
              ? result.networkErrors.filter((e): e is string => typeof e === "string")
              : [],
            bootTimedOut: result?.bootTimedOut === true,
            blankScreen: result?.blankScreen === true,
          });
        } catch {
          window.glass.idePreviewProbeResult({ skipped: true });
        }
      })();
    });
  }, [activeUrl]);

  const commitUrl = useCallback((): void => {
    const normalized = normalizePreviewUrl(draftUrl);
    if (!normalized) return;
    window.glass.glassIdePreviewSetUrl(normalized);
  }, [draftUrl]);

  const handleReload = (): void => {
    window.glass.glassIdePreviewReload();
  };

  return (
    <div className="gide-preview" data-testid="glass-ide-preview">
      <div className="gide-preview__toolbar">
        <input
          type="text"
          className="gide-preview__url"
          value={draftUrl}
          placeholder="http://localhost:5173"
          spellCheck={false}
          onChange={(e) => setDraftUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitUrl();
            }
          }}
          onPointerDown={ensureOverlayInteractive}
        />
        <GlassHoverTooltip label="Load preview URL" placement="bottom">
          <button
            type="button"
            className="gide-preview__btn"
            disabled={!normalizePreviewUrl(draftUrl)}
            onClick={commitUrl}
            onPointerDown={ensureOverlayInteractive}
            aria-label="Go to URL"
          >
            Go
          </button>
        </GlassHoverTooltip>
        <GlassHoverTooltip label="Reload preview" placement="bottom">
          <button
            type="button"
            className="gide-preview__btn"
            disabled={!activeUrl}
            onClick={handleReload}
            onPointerDown={ensureOverlayInteractive}
            aria-label="Reload preview"
          >
            ↻
          </button>
        </GlassHoverTooltip>
      </div>
      <div className="gide-preview__frame">
        {activeUrl ? (
          <webview
            ref={webviewRef}
            className="gide-preview__webview"
            src={activeUrl}
            allowpopups={false}
            webpreferences="contextIsolation=yes, sandbox=yes"
          />
        ) : (
          <div className="gide-preview__empty">
            <p>Run a dev server in the terminal — Glass will detect <code>localhost</code> automatically.</p>
            <p className="gide-preview__empty-hint">
              Or paste a local URL above. Static <code>index.html</code> in the project opens automatically when present.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
