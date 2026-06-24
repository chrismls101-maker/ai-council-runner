/**
 * Phase5Deliver -- The payoff screen
 * SCQA frame -> Key Judgments -> Options Scorecard -> Contradiction Cards -> Audit Trail
 * Based on: NIE Key Judgments + Policy Option Memo + Intelligence Community confidence standards
 */
import { useEffect, useRef, useState } from 'react';
import type { phase5Data as Phase5DataType } from '../phaseContent';
import './Phase5Deliver.css';

type Phase5DataShape = typeof Phase5DataType;

const TAG_COLORS: Record<string, string> = {
  VERIFIED:  'var(--r-green)',
  SUPPORTED: 'var(--r-blue)',
  INFERRED:  'var(--r-amber)',
  CONTESTED: 'var(--r-amber)',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  HIGH:     'var(--r-green)',
  MODERATE: 'var(--r-amber)',
  LOW:      'rgba(255,255,255,0.35)',
};

const RISK_COLORS: Record<string, string> = {
  'Low':        'var(--r-green)',
  'Low-Medium': 'var(--r-amber)',
  'Medium':     'var(--r-amber)',
  'High':       '#ef4444',
};

interface Props {
  data: Phase5DataShape;
  visible: boolean;
}

function useTypingReveal(visible: boolean, count: number, delayMs = 600) {
  const [revealed, setRevealed] = useState(0);
  useEffect(() => {
    if (!visible) { setRevealed(0); return; }
    let i = 0;
    const tick = () => {
      i++;
      setRevealed(i);
      if (i < count) setTimeout(tick, delayMs);
    };
    const t = setTimeout(tick, 800);
    return () => clearTimeout(t);
  }, [visible, count, delayMs]);
  return revealed;
}

export function Phase5Deliver({ data, visible }: Props) {
  const [showAudit, setShowAudit] = useState(false);
  const [contradictionOpen, setContradictionOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const judgementsRevealed = useTypingReveal(visible, data.keyJudgments.length, 650);
  const optionsRevealed    = useTypingReveal(
    judgementsRevealed >= data.keyJudgments.length,
    data.options.length,
    700
  );
  const showBottom = optionsRevealed >= data.options.length;

  // Auto-scroll as content appears
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [judgementsRevealed, optionsRevealed, showBottom]);

  return (
    <div className={`phase5-panel ${visible ? 'visible' : ''}`}>
      <div className="phase5-scroll" ref={scrollRef}>
        <div className="phase5-inner">

          {/* SCQA Frame */}
          <div className="phase5-eyebrow">Aletheia &mdash; Research Complete</div>
          <div className="phase5-question">{data.question}</div>

          {/* Key Judgments */}
          <div className="phase5-section-head">Key Judgments</div>
          <div className="phase5-judgments">
            {data.keyJudgments.map((j, idx) => (
              <div
                key={j.id}
                className={`judgment-row ${idx < judgementsRevealed ? 'in' : ''}`}
              >
                <div className="judgment-meta">
                  <span
                    className="judgment-tag"
                    style={{ color: TAG_COLORS[j.tag] ?? 'rgba(255,255,255,0.4)' }}
                  >
                    {j.tag}
                  </span>
                  <span
                    className="judgment-confidence"
                    style={{ color: CONFIDENCE_COLORS[j.confidence] ?? 'rgba(255,255,255,0.35)' }}
                  >
                    {j.confidence} CONFIDENCE
                  </span>
                  <span className="judgment-sources">{j.sources} sources</span>
                </div>
                <div className="judgment-text">
                  <span className="judgment-likelihood">We assess it is {j.likelihood} that </span>
                  {j.claim}
                </div>
              </div>
            ))}
          </div>

          {/* Options Scorecard */}
          {judgementsRevealed >= data.keyJudgments.length && (
            <>
              <div className="phase5-section-head">
                Paths to $10k
                <span className="section-sub">Choose based on your situation</span>
              </div>
              <div className="phase5-options">
                {data.options.map((opt, idx) => (
                  <div
                    key={opt.id}
                    className={`option-card ${opt.recommended ? 'recommended' : ''} ${idx < optionsRevealed ? 'in' : ''}`}
                  >
                    {opt.recommended && (
                      <div className="option-rec-badge">Recommended</div>
                    )}
                    <div className="option-id">{opt.id}</div>
                    <div className="option-name">{opt.name}</div>
                    <div className="option-desc">{opt.description}</div>
                    <div className="option-metrics">
                      <div className="option-metric">
                        <span className="metric-label">Timeline</span>
                        <span className="metric-value">{opt.timeline}</span>
                      </div>
                      <div className="option-metric">
                        <span className="metric-label">Risk</span>
                        <span
                          className="metric-value"
                          style={{ color: RISK_COLORS[opt.risk] ?? 'inherit' }}
                        >
                          {opt.risk}
                        </span>
                      </div>
                      <div className="option-metric">
                        <span className="metric-label">Confidence</span>
                        <span
                          className="metric-value"
                          style={{ color: CONFIDENCE_COLORS[opt.confidence.toUpperCase()] ?? 'inherit' }}
                        >
                          {opt.confidence}
                        </span>
                      </div>
                    </div>
                    <div className="option-why">{opt.why}</div>
                    <div className="option-reverse">
                      <span className="reverse-label">Reverses if: </span>
                      {opt.reverseIf}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Contradictions + Audit */}
          {showBottom && (
            <div className={`phase5-bottom ${showBottom ? 'in' : ''}`}>

              {/* Contradiction Cards */}
              {data.contradictions.length > 0 && (
                <div className="contradiction-section">
                  <button
                    className="section-toggle"
                    onClick={() => setContradictionOpen(v => !v)}
                  >
                    <span className="toggle-dot warn" />
                    {data.contradictions.length} Unresolved Conflict{data.contradictions.length > 1 ? 's' : ''}
                    <span className="toggle-arrow">{contradictionOpen ? '▲' : '▼'}</span>
                  </button>
                  {contradictionOpen && data.contradictions.map((c, i) => (
                    <div key={i} className="contradiction-card">
                      <div className="conflict-row">
                        <div className="conflict-side">
                          <div className="conflict-source">{c.claim1.source}</div>
                          <div className="conflict-text">{c.claim1.text}</div>
                        </div>
                        <div className="conflict-vs">vs</div>
                        <div className="conflict-side">
                          <div className="conflict-source">{c.claim2.source}</div>
                          <div className="conflict-text">{c.claim2.text}</div>
                        </div>
                      </div>
                      <div className="conflict-type">Conflict type: {c.type}</div>
                      <div className="conflict-resolution">{c.resolution}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Audit Trail */}
              <div className="audit-section">
                <button
                  className="section-toggle"
                  onClick={() => setShowAudit(v => !v)}
                >
                  <span className="toggle-dot signal" />
                  Audit Trail &mdash; {data.auditTrail.confidence}% overall confidence
                  <span className="toggle-arrow">{showAudit ? '▲' : '▼'}</span>
                </button>
                {showAudit && (
                  <div className="audit-grid">
                    <div className="audit-item">
                      <span className="audit-val">{data.auditTrail.sourcesScanned}</span>
                      <span className="audit-label">sources scanned</span>
                    </div>
                    <div className="audit-item">
                      <span className="audit-val">{data.auditTrail.sourcesDeepRead}</span>
                      <span className="audit-label">deep-read</span>
                    </div>
                    <div className="audit-item">
                      <span className="audit-val">{data.auditTrail.claimsVerified}</span>
                      <span className="audit-label">claims verified</span>
                    </div>
                    <div className="audit-item">
                      <span className="audit-val">{data.auditTrail.claimsSoftened}</span>
                      <span className="audit-label">claims softened</span>
                    </div>
                    <div className="audit-item">
                      <span className="audit-val">{data.auditTrail.contradictionsResolved}</span>
                      <span className="audit-label">contradictions resolved</span>
                    </div>
                    <div className="audit-item">
                      <span className="audit-val">{data.auditTrail.phases}</span>
                      <span className="audit-label">phases run</span>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
