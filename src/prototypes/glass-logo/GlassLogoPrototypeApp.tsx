import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import IivoGlassLogo, { DEFAULT_GLASS_LOGO_PROPS } from "../../components/glass-logo/IivoGlassLogo.tsx";
import type { IivoGlassLogoProps } from "../../components/glass-logo/types.ts";
import "./glass-logo-prototype.css";

type ControlKey = keyof typeof DEFAULT_GLASS_LOGO_PROPS;

const SLIDER_CONTROLS: {
  key: ControlKey;
  label: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "logoSize", label: "Logo size", min: 0.5, max: 1.8, step: 0.05 },
  { key: "depth", label: "Depth", min: 0.15, max: 0.9, step: 0.02 },
  { key: "bevelSize", label: "Bevel", min: 0.01, max: 0.14, step: 0.005 },
  { key: "glassOpacity", label: "Opacity", min: 0.4, max: 1, step: 0.02 },
  { key: "roughness", label: "Roughness", min: 0, max: 0.45, step: 0.01 },
  { key: "transmission", label: "Transmission", min: 0.5, max: 1, step: 0.02 },
  { key: "thickness", label: "Thickness", min: 0.3, max: 2.5, step: 0.05 },
  { key: "ior", label: "IOR", min: 1.1, max: 2.1, step: 0.02 },
  { key: "shatterStrength", label: "Shatter strength", min: 0.2, max: 2.5, step: 0.05 },
  { key: "shatterSpread", label: "Shatter spread", min: 0.4, max: 2.5, step: 0.05 },
  { key: "shatterSpeed", label: "Shatter speed", min: 0.4, max: 2, step: 0.05 },
  { key: "shatterDamping", label: "Damping", min: 0.5, max: 0.95, step: 0.01 },
  { key: "shatterRecoveryMs", label: "Recovery (ms)", min: 300, max: 2400, step: 50 },
  { key: "parallaxStrength", label: "Parallax", min: 0, max: 2, step: 0.05 },
];

export default function GlassLogoPrototypeApp() {
  const [props, setProps] = useState<IivoGlassLogoProps>({ ...DEFAULT_GLASS_LOGO_PROPS });
  const [glassTint, setGlassTint] = useState("#e8f4ff");
  const [usingFallback, setUsingFallback] = useState(false);

  const logoProps = useMemo(
    () => ({ ...props, glassTint }),
    [props, glassTint],
  );

  const update = (key: ControlKey, value: number | boolean | string) => {
    setProps((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="glass-logo-prototype">
      <div className="glass-logo-prototype__backdrop" aria-hidden="true" />

      <motion.header
        className="glass-logo-prototype__header"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <p className="glass-logo-prototype__eyebrow">Prototype · WebGL</p>
        <h1>IIVO Glass Logo</h1>
        <p className="glass-logo-prototype__sub">
          Premium 3D transmission material · mouse parallax · click-to-shatter
        </p>
      </motion.header>

      <motion.section
        className="glass-logo-prototype__stage"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        <IivoGlassLogo
          {...logoProps}
          style={{ minHeight: 360 }}
          onFallback={() => setUsingFallback(true)}
        />
        {usingFallback ? (
          <p className="glass-logo-prototype__fallback-note">WebGL fallback active</p>
        ) : null}
      </motion.section>

      <aside className="glass-logo-prototype__controls" aria-label="Logo controls">
        <h2>Controls</h2>

        <label className="glass-logo-prototype__control">
          <span>Glass tint</span>
          <input
            type="color"
            value={glassTint}
            onChange={(e) => setGlassTint(e.target.value)}
          />
        </label>

        {SLIDER_CONTROLS.map(({ key, label, min, max, step }) => (
          <label key={key} className="glass-logo-prototype__control">
            <span>
              {label}{" "}
              <em>{Number(props[key] ?? DEFAULT_GLASS_LOGO_PROPS[key]).toFixed(2)}</em>
            </span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={Number(props[key] ?? DEFAULT_GLASS_LOGO_PROPS[key])}
              onChange={(e) => update(key, Number(e.target.value))}
            />
          </label>
        ))}

        <label className="glass-logo-prototype__toggle">
          <input
            type="checkbox"
            checked={props.shatterEnabled ?? true}
            onChange={(e) => update("shatterEnabled", e.target.checked)}
          />
          Shatter enabled
        </label>
        <label className="glass-logo-prototype__toggle">
          <input
            type="checkbox"
            checked={props.shatterOnHover ?? false}
            onChange={(e) => update("shatterOnHover", e.target.checked)}
          />
          Shatter on hover
        </label>
        <label className="glass-logo-prototype__toggle">
          <input
            type="checkbox"
            checked={props.idleFloatEnabled ?? true}
            onChange={(e) => update("idleFloatEnabled", e.target.checked)}
          />
          Idle float
        </label>

        <button
          type="button"
          className="glass-logo-prototype__reset"
          onClick={() => {
            setProps({ ...DEFAULT_GLASS_LOGO_PROPS });
            setGlassTint("#e8f4ff");
          }}
        >
          Reset defaults
        </button>
      </aside>
    </div>
  );
}
