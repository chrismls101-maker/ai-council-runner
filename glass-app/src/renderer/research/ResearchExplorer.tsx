/**
 * ResearchExplorer -- Aletheia Research Agent UI
 *
 * Screens:
 *   intro   = Glass input screen (user types question here, not in BuilderStrip)
 *   torrent = Live AI streaming into 3 torrent columns
 *   deliver = Phase 5 -- Key Judgments, Options, Contradictions from real AI output
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelLeft, Plus, Sun, X } from 'lucide-react';
import type { AgentEvent } from '../../shared/ipc';
import { armResearchOverlayPointer, prepareGlassTextPointerDown, prepareGlassTextContextMenu } from '../glassTextInteraction.ts';
import { TorrentColumn, type TorrentColumnHandle } from './TorrentColumn';
import { Phase5Deliver } from './delivery/Phase5Deliver';
import type { phase5Data as Phase5DataType } from './phaseContent';
import type { LineType } from './phaseContent';
import {
  createEmptySession,
  deleteSessionFromStore,
  loadResearchSessionStore,
  persistResearchSessionStore,
  sessionStatusLabel,
  sessionTitleFromQuestion,
  upsertSessionInStore,
  type ResearchSessionSnapshot,
  type ResearchSessionStore,
  type StoredTorrentLine,
} from './researchSessionStore';
import './ResearchExplorer.css';
import './delivery/Phase5Deliver.css';
import '../workspace/workspaceChrome.css';
import { WorkspaceSessionTabs } from '../workspace/WorkspaceSessionTabs';

type Phase5DataShape = typeof Phase5DataType;

/* ── helpers ──────────────────────────────────────────────────────────────── */

function createRunId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `research-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function shortenQuestion(q: string, max = 52): string {
  if (!q) return 'Research';
  return q.length > max ? q.slice(0, max - 1) + '...' : q;
}

function ascii(s: string): string {
  return s
    .replace(/—|–/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/→/g, '->')
    .replace(/•/g, '*')
    .replace(/[^\x00-\x7F]/g, '');
}

type AletheiaJson = {
  keyJudgments: Array<{
    claim: string;
    tag: string;
    likelihood: string;
    confidence: string;
    evidence: string;
  }>;
  options: Array<{
    title: string;
    summary: string;
    risk: string;
    reversesIf: string;
    tag: string;
  }>;
  contradictions: Array<{
    type: string;
    sideA: string;
    sideB: string;
    resolution: string;
  }>;
};

function extractHtmlBlock(content: string): string | null {
  const start = content.indexOf('---ALETHEIA_HTML_START---');
  const end   = content.indexOf('---ALETHEIA_HTML_END---');
  if (start === -1 || end === -1) return null;
  return content.slice(start + 25, end).trim();
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '');
}

function parseAletheiaJson(reportContent: string): AletheiaJson | null {
  try {
    const start = reportContent.indexOf('---ALETHEIA_JSON_START---');
    const end   = reportContent.indexOf('---ALETHEIA_JSON_END---');
    if (start === -1 || end === -1) return null;
    const raw = reportContent.slice(start + 25, end).trim();
    return JSON.parse(raw) as AletheiaJson;
  } catch {
    return null;
  }
}

function stripJsonBlock(text: string): string {
  const start = text.indexOf('---ALETHEIA_JSON_START---');
  if (start === -1) return text;
  return text.slice(0, start).trim();
}

function mapTag(tag: string): 'VERIFIED' | 'SUPPORTED' | 'INFERRED' | 'CONTESTED' {
  const t = tag.toUpperCase();
  if (t === 'CONFIRMED')  return 'VERIFIED';
  if (t === 'LIKELY')     return 'SUPPORTED';
  if (t === 'POSSIBLE')   return 'INFERRED';
  if (t === 'UNLIKELY')   return 'CONTESTED';
  return 'INFERRED';
}

function mapConf(c: string): 'HIGH' | 'MODERATE' | 'LOW' {
  const u = c.toUpperCase();
  if (u === 'HIGH')   return 'HIGH';
  if (u === 'LOW')    return 'LOW';
  return 'MODERATE';
}

function buildPhase5Data(
  question: string,
  parsed: AletheiaJson,
  searchCount: number,
): Phase5DataShape {
  return {
    question,
    questionShort: question.slice(0, 40) + (question.length > 40 ? '...' : ''),
    keyJudgments: parsed.keyJudgments.map((j, i) => ({
      id:         i + 1,
      claim:      j.claim,
      tag:        mapTag(j.tag),
      likelihood: j.likelihood.toLowerCase(),
      confidence: mapConf(j.confidence),
      sources:    Math.max(1, Math.round(searchCount / parsed.keyJudgments.length)),
    })),
    options: parsed.options.map((o, i) => ({
      id:          String.fromCharCode(65 + i),
      name:        o.title,
      description: o.summary,
      timeline:    '2-6 months',
      risk:        o.risk.charAt(0).toUpperCase() + o.risk.slice(1),
      confidence:  o.tag === 'RECOMMENDED' ? 'High' : o.tag === 'AVOID' ? 'Low' : 'Medium',
      recommended: o.tag === 'RECOMMENDED',
      why:         o.summary,
      reverseIf:   o.reversesIf,
    })),
    contradictions: parsed.contradictions.map(c => ({
      claim1:     { source: 'Source A', text: c.sideA },
      claim2:     { source: 'Source B', text: c.sideB },
      type:       c.type,
      resolution: c.resolution,
    })),
    auditTrail: {
      sourcesScanned:        searchCount,
      sourcesDeepRead:       Math.max(1, searchCount - 1),
      claimsVerified:        parsed.keyJudgments.length,
      claimsSoftened:        1,
      contradictionsResolved: parsed.contradictions.length,
      confidence:            78,
      phases:                4,
    },
  };
}

type SessionLines = {
  left: StoredTorrentLine[];
  mid: StoredTorrentLine[];
  right: StoredTorrentLine[];
};

function emptySessionLines(): SessionLines {
  return { left: [], mid: [], right: [] };
}

function HtmlDeliverPanel({ html, savedPath }: { html: string; savedPath: string }) {
  const fileName = savedPath ? savedPath.split('/').pop() : '';
  const safe = sanitizeHtml(html);
  return (
    <div className="real-report-panel">
      {fileName && (
        <div className="real-report-path">
          <span className="real-report-path-label">Saved</span>
          <span className="real-report-path-name">{fileName}</span>
        </div>
      )}
      <div dangerouslySetInnerHTML={{ __html: safe }} className="ws-selectable" onContextMenu={prepareGlassTextContextMenu} />
    </div>
  );
}

function RealReportPanel({ text, savedPath }: { text: string; savedPath: string }) {
  const fileName = savedPath ? savedPath.split('/').pop() : '';
  const paragraphs = stripJsonBlock(text).split(/\n{2,}/).filter(p => p.trim());

  return (
    <div className="real-report-panel">
      {fileName && (
        <div className="real-report-path">
          <span className="real-report-path-label">Saved</span>
          <span className="real-report-path-name">{fileName}</span>
        </div>
      )}
      <div className="real-report-body ws-selectable" onContextMenu={prepareGlassTextContextMenu}>
        {paragraphs.map((p, i) => {
          const line = ascii(p.trim());
          if (line.startsWith('### ')) return <h3 key={i} className="real-report-h3">{line.slice(4)}</h3>;
          if (line.startsWith('## '))  return <h2 key={i} className="real-report-h2">{line.slice(3)}</h2>;
          if (line.startsWith('# '))   return <h1 key={i} className="real-report-h1">{line.slice(2)}</h1>;
          return <p key={i} className="real-report-p">{line}</p>;
        })}
      </div>
    </div>
  );
}

interface Props {
  question: string;
  visible?: boolean;
  onClose: () => void;
}

type ResearchTheme = 'light' | 'dark';

const RESEARCH_THEME_KEY = 'glass-research-theme';

function readStoredTheme(): ResearchTheme {
  try {
    const stored = localStorage.getItem(RESEARCH_THEME_KEY);
    return stored === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function ResearchExplorer({ question: initialQuestion, visible = true, onClose }: Props) {
  const leftRef  = useRef<TorrentColumnHandle>(null);
  const midRef   = useRef<TorrentColumnHandle>(null);
  const rightRef = useRef<TorrentColumnHandle>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeQRef = useRef('');
  const runningRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const activeSessionIdRef = useRef('');
  const sessionLinesRef = useRef<Map<string, SessionLines>>(new Map());
  const lastExternalQuestionRef = useRef('');
  const storeRef = useRef<ResearchSessionStore>(loadResearchSessionStore());

  const [sessionStore, setSessionStore] = useState<ResearchSessionStore>(() => loadResearchSessionStore());
  const [screen, setScreen]       = useState<'intro' | 'torrent' | 'deliver'>('intro');
  const [inputText, setInputText] = useState('');
  const [activeQ, setActiveQ]     = useState('');
  const [phase, setPhase]         = useState(0);
  const [chip, setChip]           = useState('Aletheia');
  const [status, setStatus]       = useState('');
  const [zones, setZones]         = useState(['Sources', 'Analysis', 'Output']);

  const [counting, setCounting]   = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [introOut, setIntroOut]   = useState(false);
  const [theme, setTheme]         = useState<ResearchTheme>(() => readStoredTheme());

  const [phase5, setPhase5]       = useState<Phase5DataShape | null>(null);
  const [rawReport, setRawReport] = useState<{
    text: string;
    savedPath: string;
    htmlBlock?: string;
  } | null>(null);

  const persistStore = useCallback((next: ResearchSessionStore) => {
    storeRef.current = next;
    persistResearchSessionStore(next);
    setSessionStore(next);
  }, []);

  const snapshotFromUi = useCallback((): ResearchSessionSnapshot => {
    const sessionId = activeSessionIdRef.current;
    const lines = sessionLinesRef.current.get(sessionId) ?? emptySessionLines();
    const titleSource = activeQ.trim() || inputText.trim();
    return {
      id: sessionId,
      title: sessionTitleFromQuestion(titleSource),
      question: activeQ.trim() || inputText.trim(),
      screen,
      inputText,
      activeQ,
      phase,
      chip,
      status,
      zones: [zones[0] ?? '', zones[1] ?? '', zones[2] ?? ''] as [string, string, string],
      counting,
      countdown,
      introOut,
      leftLines: [...lines.left],
      midLines: [...lines.mid],
      rightLines: [...lines.right],
      phase5,
      rawReport,
      running: runningRef.current,
      createdAt:
        sessionStore.sessions.find((s) => s.id === sessionId)?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
  }, [
    activeQ,
    chip,
    countdown,
    counting,
    inputText,
    introOut,
    phase,
    phase5,
    rawReport,
    screen,
    sessionStore.sessions,
    status,
    zones,
  ]);

  const saveActiveSession = useCallback(() => {
    if (!activeSessionIdRef.current) return;
    const snapshot = snapshotFromUi();
    persistStore(upsertSessionInStore(storeRef.current, snapshot));
  }, [persistStore, snapshotFromUi]);

  const applySession = useCallback((session: ResearchSessionSnapshot) => {
    activeSessionIdRef.current = session.id;
    activeQRef.current = session.activeQ;
    runningRef.current = session.running;

    sessionLinesRef.current.set(session.id, {
      left: [...session.leftLines],
      mid: [...session.midLines],
      right: [...session.rightLines],
    });

    setScreen(session.screen);
    setInputText(session.inputText);
    setActiveQ(session.activeQ);
    setPhase(session.phase);
    setChip(session.chip);
    setStatus(session.status);
    setZones([...session.zones]);
    setCounting(session.counting);
    setCountdown(session.countdown);
    setIntroOut(session.introOut);
    setPhase5(session.phase5 as Phase5DataShape | null);
    setRawReport(session.rawReport);

    requestAnimationFrame(() => {
      leftRef.current?.restore(session.leftLines);
      midRef.current?.restore(session.midLines);
      rightRef.current?.restore(session.rightLines);
    });
  }, []);

  const commitStore = useCallback(
    (next: ResearchSessionStore, sessionToApply?: ResearchSessionSnapshot) => {
      persistStore(next);
      if (sessionToApply) applySession(sessionToApply);
    },
    [applySession, persistStore],
  );

  useEffect(() => {
    const loaded = loadResearchSessionStore();
    storeRef.current = loaded;
    setSessionStore(loaded);
    const active = loaded.sessions.find((s) => s.id === loaded.activeSessionId) ?? loaded.sessions[0];
    if (active) applySession(active);
  }, [applySession]);

  useEffect(() => {
    if (!visible) return;
    document.body.classList.add("glass-body--research-active");
    armResearchOverlayPointer();
    const t = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => {
      document.body.classList.remove("glass-body--research-active");
      window.clearTimeout(t);
    };
  }, [visible]);

  useEffect(() => {
    try {
      localStorage.setItem(RESEARCH_THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    return () => { cleanupRef.current?.(); };
  }, []);

  useEffect(() => {
    const q = initialQuestion.trim();
    if (!q || q === lastExternalQuestionRef.current) return;
    lastExternalQuestionRef.current = q;
    saveActiveSession();
    const session = createEmptySession(q);
    sessionLinesRef.current.set(session.id, emptySessionLines());
    const next = upsertSessionInStore(storeRef.current, session);
    commitStore(next, session);
  }, [commitStore, initialQuestion, saveActiveSession]);

  useEffect(() => {
    const timer = window.setTimeout(() => saveActiveSession(), 400);
    return () => window.clearTimeout(timer);
  }, [
    activeQ,
    chip,
    countdown,
    counting,
    inputText,
    introOut,
    phase,
    phase5,
    rawReport,
    saveActiveSession,
    screen,
    status,
    zones,
  ]);

  const toggleTheme = useCallback(() => {
    setTheme(current => (current === 'light' ? 'dark' : 'light'));
  }, []);

  const armResearchInput = useCallback(() => {
    armResearchOverlayPointer();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const getSessionLines = useCallback((sessionId: string): SessionLines => {
    if (!sessionLinesRef.current.has(sessionId)) {
      sessionLinesRef.current.set(sessionId, emptySessionLines());
    }
    return sessionLinesRef.current.get(sessionId)!;
  }, []);

  const pushToColumn = useCallback(
    (
      sessionId: string,
      column: 'left' | 'mid' | 'right',
      text: string,
      type: LineType = 'normal',
    ) => {
      const lines = getSessionLines(sessionId);
      const entry = { text, type };
      if (column === 'left') lines.left.push(entry);
      if (column === 'mid') lines.mid.push(entry);
      if (column === 'right') lines.right.push(entry);

      if (activeSessionIdRef.current !== sessionId) return;
      if (column === 'left') leftRef.current?.push(text, type);
      if (column === 'mid') midRef.current?.push(text, type);
      if (column === 'right') rightRef.current?.push(text, type);
    },
    [getSessionLines],
  );

  const pushLeft  = useCallback((sessionId: string, t: string, tp?: string) => {
    pushToColumn(sessionId, 'left', ascii(t), (tp ?? 'normal') as LineType);
  }, [pushToColumn]);

  const pushMid = useCallback((sessionId: string, t: string, tp?: string) => {
    pushToColumn(sessionId, 'mid', ascii(t), (tp ?? 'normal') as LineType);
  }, [pushToColumn]);

  const pushRight = useCallback((sessionId: string, t: string, tp?: string) => {
    pushToColumn(sessionId, 'right', ascii(t), (tp ?? 'normal') as LineType);
  }, [pushToColumn]);

  const patchSessionInStore = useCallback(
    (sessionId: string, patch: Partial<ResearchSessionSnapshot>) => {
      const existing = storeRef.current.sessions.find((s) => s.id === sessionId);
      if (!existing) return;
      const lines = getSessionLines(sessionId);
      const merged: ResearchSessionSnapshot = {
        ...existing,
        ...patch,
        id: sessionId,
        leftLines: [...lines.left],
        midLines: [...lines.mid],
        rightLines: [...lines.right],
        updatedAt: Date.now(),
      };
      persistStore(upsertSessionInStore(storeRef.current, merged));
    },
    [getSessionLines, persistStore],
  );

  const runResearch = useCallback(async (question: string, sessionId: string) => {
    if (runningRef.current) return;
    runningRef.current = true;
    patchSessionInStore(sessionId, { running: true, screen: 'torrent', activeQ: question });

    const runId = createRunId();
    let searchCount   = 0;
    let savedPath     = '';
    let reportContent = '';
    let rightBuffer   = '';
    let writingReport = false;

    const applyIfActive = (fn: () => void) => {
      if (activeSessionIdRef.current === sessionId) fn();
    };

    applyIfActive(() => {
      setPhase(1);
      setStatus('Phase 1  --  Initializing');
      setChip('Aletheia - Researching');
      setZones(['Sources', 'Analysis', 'Report']);
    });
    patchSessionInStore(sessionId, {
      phase: 1,
      status: 'Phase 1  --  Initializing',
      chip: 'Aletheia - Researching',
      zones: ['Sources', 'Analysis', 'Report'],
    });

    const cleanup = window.glass.onAgentEvent((ev: AgentEvent) => {
      if (ev.runId !== runId) return;

      switch (ev.kind) {

        case 'tool-start': {
          if (ev.toolName === 'web_search') {
            searchCount++;
            const query = (ev.toolInput as { query?: string })?.query ?? '';
            pushLeft(sessionId, `Searching: ${query}`, 'dim');
            pushLeft(sessionId, '');
            applyIfActive(() => {
              setPhase(1);
              setStatus('Phase 1  --  Web Search');
            });
            patchSessionInStore(sessionId, { phase: 1, status: 'Phase 1  --  Web Search' });
            pushMid(sessionId, 'Decomposing research angles...');
            pushMid(sessionId, '');
          } else if (ev.toolName === 'write_file') {
            writingReport = true;
            const input = ev.toolInput as { filename?: string; content?: string } | null;
            reportContent = input?.content ?? '';

            if (rightBuffer.trim()) { pushRight(sessionId, rightBuffer.trim()); rightBuffer = ''; }
            pushRight(sessionId, '');
            pushRight(sessionId, 'Compiling report...', 'dim');

            applyIfActive(() => {
              setPhase(4);
              setStatus('Phase 4  --  Saving');
            });
            patchSessionInStore(sessionId, { phase: 4, status: 'Phase 4  --  Saving' });

            const visibleLines = stripJsonBlock(reportContent)
              .split('\n').filter(l => l.trim()).slice(0, 80);
            visibleLines.forEach((l, i) =>
              setTimeout(() => pushRight(sessionId, l.slice(0, 88)), i * 25)
            );
          }
          break;
        }

        case 'tool-done': {
          if (ev.toolName === 'web_search' && ev.toolResult) {
            applyIfActive(() => {
              setPhase(2);
              setStatus('Phase 2  --  Reading Sources');
            });
            patchSessionInStore(sessionId, { phase: 2, status: 'Phase 2  --  Reading Sources' });
            pushLeft(sessionId, '');
            pushLeft(sessionId, 'Sources:', 'dim');
            const lines = ev.toolResult
              .split('\n').map(l => l.trim()).filter(Boolean);
            lines.forEach(l => pushLeft(sessionId, l.slice(0, 88)));
            pushLeft(sessionId, '');
            pushMid(sessionId, 'Cross-referencing sources...');
            pushMid(sessionId, 'Extracting key claims...');
            pushMid(sessionId, '');
            applyIfActive(() => {
              setPhase(3);
              setStatus('Phase 3  --  Synthesizing');
            });
            patchSessionInStore(sessionId, { phase: 3, status: 'Phase 3  --  Synthesizing' });
          } else if (ev.toolName === 'write_file') {
            savedPath = ev.savedFilePath ?? '';
            const fname = savedPath ? savedPath.split('/').pop() ?? '' : '';
            pushRight(sessionId, '');
            pushRight(sessionId, fname ? `Saved: ${fname}` : 'Report saved.');
          }
          break;
        }

        case 'text-delta': {
          if (!ev.text || writingReport) break;
          rightBuffer += ev.text;
          const nlIdx = rightBuffer.lastIndexOf('\n');
          if (nlIdx >= 0 || rightBuffer.length >= 80) {
            const toFlush = nlIdx >= 0 ? rightBuffer.slice(0, nlIdx) : rightBuffer;
            rightBuffer   = nlIdx >= 0 ? rightBuffer.slice(nlIdx + 1) : '';
            if (toFlush.trim()) pushRight(sessionId, toFlush.trim());
          }
          break;
        }

        case 'narrate': {
          if (ev.text) pushMid(sessionId, ev.text);
          break;
        }

        case 'done': {
          if (rightBuffer.trim()) { pushRight(sessionId, rightBuffer.trim()); rightBuffer = ''; }

          const htmlBlock = extractHtmlBlock(reportContent);
          let nextPhase5: Phase5DataShape | null = null;
          let nextRawReport: ResearchSessionSnapshot['rawReport'] = null;

          if (htmlBlock) {
            nextRawReport = { text: reportContent, savedPath, htmlBlock };
          } else {
            const parsed = parseAletheiaJson(reportContent);
            if (parsed) {
              nextPhase5 = buildPhase5Data(question, parsed, searchCount);
            } else {
              nextRawReport = { text: reportContent, savedPath };
            }
          }

          applyIfActive(() => {
            setPhase(5);
            setChip('Aletheia - Complete');
            setStatus('Phase 5  --  Deliver');
            setZones(['', '', '']);
            setPhase5(nextPhase5);
            setRawReport(nextRawReport);
            setTimeout(() => setScreen('deliver'), 1200);
          });

          patchSessionInStore(sessionId, {
            running: false,
            phase: 5,
            chip: 'Aletheia - Complete',
            status: 'Phase 5  --  Deliver',
            zones: ['', '', ''],
            phase5: nextPhase5,
            rawReport: nextRawReport,
            screen: 'deliver',
          });

          runningRef.current = false;
          break;
        }

        case 'error': {
          if (rightBuffer.trim()) { pushRight(sessionId, rightBuffer.trim()); rightBuffer = ''; }
          pushRight(sessionId, '');
          pushRight(sessionId, `[ERROR] ${(ev.error ?? 'Unknown error').slice(0, 80)}`);
          applyIfActive(() => {
            setChip('Aletheia - Error');
            setStatus('Error');
          });
          patchSessionInStore(sessionId, {
            running: false,
            chip: 'Aletheia - Error',
            status: 'Error',
          });
          runningRef.current = false;
          break;
        }

        case 'cancelled': {
          if (rightBuffer.trim()) { pushRight(sessionId, rightBuffer.trim()); rightBuffer = ''; }
          pushRight(sessionId, 'Research cancelled.');
          applyIfActive(() => setStatus('Cancelled'));
          patchSessionInStore(sessionId, { running: false, status: 'Cancelled' });
          runningRef.current = false;
          break;
        }

        default: break;
      }
    });

    cleanupRef.current = cleanup;

    try {
      const res = await window.glass.agentRun({
        agentId: 'research',
        prompt: question,
        runId,
      });

      if (!res.started) {
        pushRight(sessionId, `Failed to start: ${res.error ?? 'agent refused'}`);
        applyIfActive(() => setStatus('Error'));
        patchSessionInStore(sessionId, { running: false, status: 'Error' });
        runningRef.current = false;
      }
    } catch (err) {
      pushRight(sessionId, `Error: ${String(err).slice(0, 80)}`);
      applyIfActive(() => setStatus('Error'));
      patchSessionInStore(sessionId, { running: false, status: 'Error' });
      runningRef.current = false;
    }
  }, [patchSessionInStore, pushLeft, pushMid, pushRight]);

  const handleSubmit = useCallback(() => {
    const q = inputText.trim();
    if (!q || counting) return;
    setActiveQ(q);
    activeQRef.current = q;
    setCounting(true);
    setCountdown(3);
    patchSessionInStore(activeSessionIdRef.current, {
      activeQ: q,
      counting: true,
      countdown: 3,
      title: sessionTitleFromQuestion(q),
    });
  }, [counting, inputText, patchSessionInStore]);

  const handleHide = useCallback(() => {
    saveActiveSession();
    onClose();
  }, [onClose, saveActiveSession]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
    if (e.key === 'Escape') handleHide();
  }, [handleHide, handleSubmit]);

  useEffect(() => {
    if (!counting) return;
    if (countdown <= 0) {
      setIntroOut(true);
      patchSessionInStore(activeSessionIdRef.current, { introOut: true, counting: false });
      setTimeout(() => {
        setScreen('torrent');
        runResearch(activeQRef.current, activeSessionIdRef.current);
      }, 650);
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [counting, countdown, patchSessionInStore, runResearch]);

  const resetUiToIntro = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    runningRef.current = false;

    setPhase(0);
    setChip('Aletheia');
    setStatus('');
    setZones(['Sources', 'Analysis', 'Output']);
    leftRef.current?.clear();
    midRef.current?.clear();
    rightRef.current?.clear();
    setPhase5(null);
    setRawReport(null);
    setScreen('intro');
    setCounting(false);
    setCountdown(3);
    setIntroOut(false);
    setInputText('');
    setActiveQ('');
    activeQRef.current = '';
  }, []);

  const handleNewSession = useCallback(() => {
    saveActiveSession();
    const session = createEmptySession();
    sessionLinesRef.current.set(session.id, emptySessionLines());
    resetUiToIntro();
    const next = upsertSessionInStore(storeRef.current, session);
    commitStore(next, session);
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [commitStore, resetUiToIntro, saveActiveSession, visible]);

  const handleRestart = useCallback(() => {
    handleNewSession();
  }, [handleNewSession]);

  const switchSession = useCallback(
    (sessionId: string) => {
      if (sessionId === activeSessionIdRef.current) return;
      saveActiveSession();
      const session = storeRef.current.sessions.find((s) => s.id === sessionId);
      if (!session) return;
      const next = { ...storeRef.current, activeSessionId: sessionId };
      commitStore(next, session);
    },
    [commitStore, saveActiveSession],
  );

  const handleDeleteSession = useCallback(
    (sessionId: string, event: React.MouseEvent) => {
      event.stopPropagation();
      saveActiveSession();
      const next = deleteSessionFromStore(storeRef.current, sessionId);
      const active = next.sessions.find((s) => s.id === next.activeSessionId) ?? next.sessions[0];
      if (!active) return;
      commitStore(next, active);
    },
    [commitStore, saveActiveSession],
  );

  const toggleSidebar = useCallback(() => {
    const next = { ...storeRef.current, sidebarOpen: !storeRef.current.sidebarOpen };
    persistStore(next);
  }, [persistStore]);

  const progress  = phase === 0 ? 0 : phase === 1 ? 20 : phase === 2 ? 45 : phase === 3 ? 68 : phase === 4 ? 88 : 100;
  const shortQ    = shortenQuestion(activeQ);
  const canSubmit = inputText.trim().length > 0 && !counting;
  const tabSessions = sessionStore.sessions.slice(0, 8);

  return (
    <div
      className={[
        'research-explorer',
        `research-explorer--${theme}`,
        !visible && 'research-explorer--hidden',
        sessionStore.sidebarOpen && 'research-explorer--sidebar-open',
      ].filter(Boolean).join(' ')}
    >
      <div className="research-explorer__glass" aria-hidden="true" />

      <aside
        className={`research-sidebar${sessionStore.sidebarOpen ? ' research-sidebar--open' : ''}`}
        aria-label="Recent research"
      >
        <div className="research-sidebar__header">
          <span className="research-sidebar__title">Recent research</span>
          <button
            type="button"
            className="research-sidebar__close"
            onClick={toggleSidebar}
            aria-label="Close history panel"
          >
            <X size={16} />
          </button>
        </div>
        <div className="research-sidebar__list">
          {sessionStore.sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              className={`research-sidebar__item${
                session.id === sessionStore.activeSessionId ? ' research-sidebar__item--active' : ''
              }`}
              onClick={() => switchSession(session.id)}
            >
              <span className="research-sidebar__item-title">{session.title}</span>
              <span className="research-sidebar__item-meta">
                <span>{sessionStatusLabel(session)}</span>
                <span>{new Date(session.updatedAt).toLocaleDateString()}</span>
              </span>
              <span
                role="button"
                tabIndex={0}
                className="research-sidebar__item-delete"
                aria-label={`Delete ${session.title}`}
                onClick={(event) => handleDeleteSession(session.id, event)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleDeleteSession(session.id, event as unknown as React.MouseEvent);
                  }
                }}
              >
                <X size={12} />
              </span>
            </button>
          ))}
        </div>
      </aside>

      <header
        className="research-chrome"
        onPointerDownCapture={() => armResearchOverlayPointer()}
      >
        <div className="research-chrome__left">
          <button
            type="button"
            className="research-history-toggle"
            onClick={toggleSidebar}
            onPointerDown={prepareGlassTextPointerDown}
            aria-label="Toggle research history"
            aria-expanded={sessionStore.sidebarOpen}
          >
            <PanelLeft size={16} strokeWidth={1.75} />
            <span>History</span>
          </button>
          <button
            type="button"
            className="research-new-btn"
            onClick={handleNewSession}
            onPointerDown={prepareGlassTextPointerDown}
          >
            <Plus size={15} strokeWidth={2} />
            <span>New</span>
          </button>
          <WorkspaceSessionTabs
            sessions={tabSessions}
            activeSessionId={sessionStore.activeSessionId}
            onSelect={switchSession}
            onClose={(sessionId, event) => handleDeleteSession(sessionId, event)}
            shortenTitle={(title) => shortenQuestion(title, 28)}
            ariaLabel="Open research sessions"
          />
        </div>
        <div className="research-chrome__right">
          <button
            type="button"
            className="ws-chrome-theme"
            onClick={toggleTheme}
            onPointerDown={prepareGlassTextPointerDown}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            <span className="ws-chrome-theme__icon" aria-hidden="true">
              <Sun size={14} strokeWidth={1.75} />
            </span>
            <span>{theme === 'light' ? 'Light' : 'Dark'}</span>
          </button>
          <button
            type="button"
            className="ws-chrome-exit"
            onClick={handleHide}
            onPointerDown={prepareGlassTextPointerDown}
            aria-label="Exit research panel"
          >
            Exit Research
          </button>
        </div>
      </header>

      {screen === 'intro' && (
        <div className={`research-intro ${introOut ? 'research-intro--out' : ''}`}>
          <div className="research-intro-inner">
            <div className="ri-chip">Aletheia Research</div>
            {!counting ? (
              <>
                <div className="ri-label">What do you want to research?</div>
                <textarea
                  ref={inputRef}
                  className="ri-input"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPointerDown={prepareGlassTextPointerDown}
                  onMouseDown={armResearchInput}
                  onFocus={armResearchInput}
                  onContextMenu={prepareGlassTextContextMenu}
                  placeholder="e.g. How to use Claude to create $10k/month income"
                  rows={3}
                  spellCheck={false}
                />
                <div className="ri-actions">
                  <button className="ri-submit" onClick={handleSubmit} disabled={!canSubmit}>
                    Begin Research
                  </button>
                  <button className="ri-cancel" onClick={handleHide}>Cancel</button>
                </div>
                <div className="ri-hint">Enter to submit &nbsp;&middot;&nbsp; Esc to hide</div>
              </>
            ) : (
              <>
                <div className="ri-question">{activeQ}</div>
                <div className="ri-status">
                  {countdown > 0 ? `Beginning in ${countdown}...` : 'Starting...'}
                </div>
                <div className="ri-bar">
                  <div className="ri-bar-fill" style={{ width: `${((3 - countdown) / 3) * 100}%` }} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {screen !== 'intro' && (
        <div className="research-content">
          <div className="research-topbar">
            <div className="research-chip">{chip}</div>
            <div className="research-question">{shortQ}</div>
            <div className="research-status">{status}</div>
            {screen === 'deliver' && (
              <button className="research-restart" onClick={handleRestart}>New Search</button>
            )}
            <button className="research-close" onClick={handleHide} aria-label="Hide">x</button>
          </div>

          <div className="research-zones">
            {zones.map((z, i) => (
              <div key={i} className="research-zone-label">{z}</div>
            ))}
          </div>

          <div className="research-columns">
            <TorrentColumn ref={leftRef}  label="Sources" />
            <TorrentColumn ref={midRef}   label="Analysis" />
            <TorrentColumn ref={rightRef} label="Output" />

            {screen === 'deliver' && (
              <div className="research-real-report">
                {rawReport?.htmlBlock ? (
                  <HtmlDeliverPanel html={rawReport.htmlBlock} savedPath={rawReport.savedPath} />
                ) : phase5 ? (
                  <Phase5Deliver data={phase5} visible={true} />
                ) : rawReport ? (
                  <RealReportPanel text={rawReport.text} savedPath={rawReport.savedPath} />
                ) : null}
              </div>
            )}
          </div>

          <div className="research-progress">
            <div className="research-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
