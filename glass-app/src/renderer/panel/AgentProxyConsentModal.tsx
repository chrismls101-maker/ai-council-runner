/**
 * AgentProxyConsentModal — First-use permission screen for agent interception.
 *
 * Shown once before Glass starts intercepting any AI agent API calls.
 * The user must explicitly click "Enable" — there is no implicit consent.
 *
 * Design principle: be completely honest about what Glass captures and
 * what it never touches. Users should feel in control, not surveilled.
 */

interface AgentProxyConsentModalProps {
  port: number;
  onEnable: () => void;
  onDismiss: () => void;
}

export function AgentProxyConsentModal({
  port,
  onEnable,
  onDismiss,
}: AgentProxyConsentModalProps): JSX.Element {
  return (
    <div className="ap-consent-backdrop" data-testid="agent-proxy-consent-modal">
      <div className="ap-consent-modal" role="dialog" aria-modal="true" aria-labelledby="ap-consent-title">

        {/* Header */}
        <div className="ap-consent-header">
          <div className="ap-consent-icon" aria-hidden="true">⚡</div>
          <div>
            <div className="ap-consent-title" id="ap-consent-title">
              Enable Agent Interception
            </div>
            <div className="ap-consent-sub">
              IIVO Glass wants to observe your AI agent's activity
            </div>
          </div>
        </div>

        {/* What this does */}
        <div className="ap-consent-section">
          <div className="ap-consent-slbl">What this does</div>
          <p className="ap-consent-body">
            Glass will run a local proxy on{" "}
            <code className="ap-consent-code">localhost:{port}</code>. When
            you point your AI tools at this address, Glass can see what your
            agent is asking the AI and what the AI responds — and compare it
            against your Wingman session goal.
          </p>
        </div>

        {/* What Glass captures */}
        <div className="ap-consent-section">
          <div className="ap-consent-slbl ap-consent-slbl--captures">
            What Glass captures
          </div>
          <ul className="ap-consent-list" aria-label="Captured data">
            {[
              "Which AI model your tool called (e.g. claude-sonnet-4)",
              "A short snippet of each request (first 300 characters)",
              "A short snippet of each response (first 300 characters)",
              "Which tool names were called (e.g. read_file, write_file)",
              "Token counts and timestamps",
            ].map((item) => (
              <li key={item} className="ap-consent-li ap-consent-li--yes">
                <span className="ap-consent-pip ap-consent-pip--g" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* What Glass never captures */}
        <div className="ap-consent-section">
          <div className="ap-consent-slbl ap-consent-slbl--never">
            What Glass never captures
          </div>
          <ul className="ap-consent-list" aria-label="Never captured data">
            {[
              "Your API key — it's forwarded to Anthropic and immediately discarded",
              "Full message content — only first 300 chars, never the whole message",
              "Tool call inputs or outputs — Glass sees tool names only",
              "File contents that tools read or write",
              "Any data sent off this device — everything stays local",
            ].map((item) => (
              <li key={item} className="ap-consent-li ap-consent-li--no">
                <span className="ap-consent-pip ap-consent-pip--r" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* How to use it */}
        <div className="ap-consent-section">
          <div className="ap-consent-slbl">How to use it</div>
          <p className="ap-consent-body">
            After enabling, copy the environment variable shown in the Wingman
            panel and run it in your terminal before starting your AI tool:
          </p>
          <div className="ap-consent-envvar" data-testid="agent-proxy-consent-envvar">
            <code>ANTHROPIC_BASE_URL=http://localhost:{port}</code>
          </div>
        </div>

        {/* Consent footer */}
        <div className="ap-consent-footer">
          <p className="ap-consent-note" data-testid="agent-proxy-consent-note">
            You can disable agent interception at any time from the Wingman
            panel or Settings. This consent applies to all future sessions
            until you revoke it.
          </p>
          <div className="ap-consent-actions">
            <button
              type="button"
              className="ap-consent-btn ap-consent-btn--dismiss"
              data-testid="agent-proxy-consent-dismiss"
              onClick={onDismiss}
            >
              Not now
            </button>
            <button
              type="button"
              className="ap-consent-btn ap-consent-btn--enable"
              data-testid="agent-proxy-consent-enable"
              onClick={onEnable}
            >
              Enable Agent Interception
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
