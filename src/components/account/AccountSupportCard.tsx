import type { JSX } from "react";

type SupportItem = {
  label: string;
  href?: string;
  comingSoon?: boolean;
};

const SUPPORT_ITEMS: SupportItem[] = [
  { label: "Change password", comingSoon: true },
  { label: "Change email", comingSoon: true },
  { label: "Delete account", comingSoon: true },
];

export default function AccountSupportCard(): JSX.Element {
  return (
    <section className="glass-account-card">
      <h2 className="glass-account-card__title">Manage your account</h2>
      <ul className="glass-account-support">
        {SUPPORT_ITEMS.map((item) => (
          <li key={item.label} className="glass-account-support__item">
            {item.href && !item.comingSoon ? (
              <a className="glass-account-support__link" href={item.href}>
                {item.label}
              </a>
            ) : (
              <span className="glass-account-support__label">{item.label}</span>
            )}
            {item.comingSoon ? (
              <span className="glass-account-support__badge">Coming soon</span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="glass-account-card__hint glass-account-card__hint--support">
        Need help?{" "}
        <a className="glass-account-support__mailto" href="mailto:support@iivo.ai">
          Email support@iivo.ai
        </a>
      </p>
    </section>
  );
}
