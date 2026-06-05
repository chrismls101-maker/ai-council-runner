import "@fontsource/michroma/400.css";
import "@fontsource/sora/400.css";
import "@fontsource/sora/500.css";
import eyeEmblem from "../assets/iivo-glass-boot-eye.png";
import eyeEmblem2x from "../assets/iivo-glass-boot-eye@2x.png";
import {
  DEFAULT_GLASS_ENERGY_DURATION_MS,
  GlassEnergyProgressBar,
} from "./GlassEnergyProgressBar.tsx";
import { LoadingGlassBackground } from "./LoadingGlassBackground.tsx";
import "./iivoBrandFonts.css";
import "./loadingBootScreen.css";

/**
 * Official IIVO Glass boot / loading screen.
 * Extension-derived glass frame + approved eye artwork + live HTML typography.
 */
export function LoadingBootScreen(): JSX.Element {
  return (
    <div className="glass-boot" role="status" aria-live="polite" aria-label="IIVO Intelligence Glass loading">
      <div className="glass-boot__center-dim" aria-hidden="true" />
      <LoadingGlassBackground />
      <span className="glass-boot__pip glass-boot__pip--tl" aria-hidden="true" />
      <span className="glass-boot__pip glass-boot__pip--tr" aria-hidden="true" />
      <span className="glass-boot__pip glass-boot__pip--bl" aria-hidden="true" />
      <span className="glass-boot__pip glass-boot__pip--br" aria-hidden="true" />

      <main className="glass-boot__content">
        <div className="glass-boot__emblem">
          <span className="glass-boot__emblem-glow" aria-hidden="true" />
          <img
            className="glass-boot__emblem-img"
            src={eyeEmblem}
            srcSet={`${eyeEmblem} 1x, ${eyeEmblem2x} 2x`}
            sizes="(max-width: 1200px) 52vw, 520px"
            alt=""
            draggable={false}
            decoding="async"
            fetchPriority="high"
          />
        </div>

        <h1 className="glass-boot__title">
          <span className="glass-boot__title-chrome">
            <span className="glass-boot__title-wordmark iivo-wordmark">IIVO</span>
            <span className="glass-boot__title-rest"> INTELLIGENCE GLASS</span>
          </span>
        </h1>

        <div className="glass-boot__loading-block">
          <span className="glass-boot__loading-label">
            LOADING<span className="glass-boot__ellipsis" aria-hidden="true" />
          </span>
          <GlassEnergyProgressBar durationMs={DEFAULT_GLASS_ENERGY_DURATION_MS} />
        </div>

        <p className="glass-boot__subtitle">
          <span className="glass-boot__subtitle-inner">Initializing overlay intelligence</span>
        </p>
      </main>
    </div>
  );
}
