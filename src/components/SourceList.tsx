import {
  collectSources,
  extractDomain,
  formatSourceType,
  isSafeHttpUrl,
  sourceLinkLabel,
  type SourceEntry,
} from "../utils/sourceDisplay";
import { NO_SOURCES_MESSAGE } from "../constants/publicMessages";
import { withIivoWordmark } from "../utils/brandText";
import type { ResearchAgentMeta } from "../types";

export interface SourceListProps {
  researchSources?: string[];
  researchOutput?: string;
  researchAgentMeta?: ResearchAgentMeta;
}

function SourceCard({ entry }: { entry: SourceEntry }) {
  const sourceType = formatSourceType(entry.sourceType);
  const sourceUrlLinkable = isSafeHttpUrl(entry.url);
  const websiteLinkable = isSafeHttpUrl(entry.website);

  return (
    <li className="source-card">
      <div className="source-card-header">
        {entry.title ? (
          <div className="source-title">{entry.title}</div>
        ) : entry.domain ? (
          <div className="source-title">{entry.domain}</div>
        ) : (
          <div className="source-title">Source</div>
        )}
        {entry.kind === "entity" && entry.verificationStatus && (
          <span
            className={`source-verification status-${entry.verificationStatus.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {entry.verificationStatus}
          </span>
        )}
      </div>

      {entry.domain && entry.title && entry.domain !== entry.title && (
        <div className="source-domain">{entry.domain}</div>
      )}

      <div className="source-links">
        <div className="source-link-row">
          <span className="source-link-label">Source URL</span>
          {sourceUrlLinkable ? (
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="md-link source-url"
            >
              {sourceLinkLabel(entry)}
            </a>
          ) : (
            <span className="source-unverified">Not verified</span>
          )}
        </div>

        {entry.kind === "entity" && (
          <div className="source-link-row">
            <span className="source-link-label">Website</span>
            {websiteLinkable ? (
              <a
                href={entry.website}
                target="_blank"
                rel="noopener noreferrer"
                className="md-link source-url"
              >
                {extractDomain(entry.website!) ?? entry.website}
              </a>
            ) : (
              <span className="source-unverified">Not verified</span>
            )}
          </div>
        )}
      </div>

      {(sourceType || entry.queryUsed) && (
        <div className="source-meta">
          {sourceType && <span>Type: {sourceType}</span>}
          {entry.queryUsed && <span>Query: {entry.queryUsed}</span>}
        </div>
      )}
    </li>
  );
}

function CitationCard({ entry }: { entry: SourceEntry }) {
  if (!isSafeHttpUrl(entry.url)) return null;

  return (
    <li className="source-card">
      <div className="source-card-header">
        <div className="source-title">{entry.domain ?? "Source"}</div>
      </div>
      {entry.domain && <div className="source-domain">{entry.domain}</div>}
      <div className="source-links">
        <a
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          className="md-link source-url"
        >
          {entry.url}
        </a>
      </div>
    </li>
  );
}

export default function SourceList({
  researchSources,
  researchOutput,
  researchAgentMeta,
}: SourceListProps) {
  const sources = collectSources({
    researchOutput,
    researchSources,
    researchAgentMeta,
  });

  if (sources.length === 0) {
    return (
      <p className="muted no-sources-empty">{withIivoWordmark(NO_SOURCES_MESSAGE, "no-sources")}</p>
    );
  }

  return (
    <>
      {researchAgentMeta && (
        <div className="research-meta-inline">
          <span>Mode: {researchAgentMeta.mode}</span>
          <span>Provider: {researchAgentMeta.provider}</span>
          {researchAgentMeta.searchRequestCount != null && (
            <span>Searches: {researchAgentMeta.searchRequestCount}</span>
          )}
        </div>
      )}
      <ul className="sources-list enriched">
        {sources.map((entry) =>
          entry.kind === "entity" ? (
            <SourceCard key={entry.id} entry={entry} />
          ) : (
            <CitationCard key={entry.id} entry={entry} />
          ),
        )}
      </ul>
    </>
  );
}
