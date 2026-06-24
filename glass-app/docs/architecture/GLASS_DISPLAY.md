# Glass Display — Research Panel Background Recipes

Reference for IIVO Glass Research Explorer panel backgrounds.  
Perplexity / Apple Liquid Glass four-component recipe: **blur + tint + saturation + edge highlight**.

---

## 1. Original — Solid Dark (pre-glass)

Used when the panel needed maximum readability and zero distraction from the ambient 3D scene.

**Where:** `.research-explorer` root shell (removed in glass experiment).

```css
.research-explorer {
  position: fixed;
  inset: 0;
  z-index: 105;
  overflow: hidden;
  pointer-events: auto;
  background: rgba(4, 5, 10, 0.92);
  -webkit-font-smoothing: antialiased;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
```

**Intro overlay (also used solid frost before glass experiment):**

```css
.research-intro {
  background: rgba(6, 8, 16, 0.65);
  backdrop-filter: blur(40px) saturate(1.5);
  -webkit-backdrop-filter: blur(40px) saturate(1.5);
}
```

**Traits:** Near-opaque charcoal. No desktop/ambient bleed. Best for dense text and torrent columns.  
**Tradeoff:** No depth; ambient 3D blobs hidden entirely.

---

## 2. Experimental — Light Liquid Glass (first pass)

Full four-component recipe with a **light white tint** — reads well on marketing mockups but too transparent for a working research UI. Ambient bloom blobs (“light blobs”) dominated the panel.

**Structure:**

```html
<div class="research-explorer">
  <AmbientBackground />           <!-- z-index 0 -->
  <div class="research-explorer__glass" aria-hidden="true" />  <!-- z-index 1 -->
  <!-- UI content z-index 2+ -->
</div>
```

```css
.research-explorer {
  --research-glass-tint: rgba(255, 255, 255, 0.14);
  --research-glass-blur: 18px;
  --research-glass-saturate: 180%;
  --research-glass-border: rgba(255, 255, 255, 0.18);
  --research-glass-edge-highlight: rgba(255, 255, 255, 0.22);
  --research-glass-fallback: rgba(8, 10, 16, 0.82);

  background: transparent;
}

.research-explorer__glass {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: var(--research-glass-tint);
  backdrop-filter: blur(var(--research-glass-blur)) saturate(var(--research-glass-saturate));
  -webkit-backdrop-filter: blur(var(--research-glass-blur)) saturate(var(--research-glass-saturate));
  border: 1px solid var(--research-glass-border);
  box-shadow: inset 0 1px 0 var(--research-glass-edge-highlight);
}
```

**Traits:** True frosted glass; ambient + desktop visible.  
**Tradeoff:** White tint + bloom = muddy “light blobs”; body text fails contrast without extra scrims.

---

## 3. Research-Tuned Dark Glass (superseded)

Same layered structure as §2, but tuned for **dark data UI**: charcoal tint (not white), higher opacity, lower saturation, dimmed ambient. Kept the Three.js blob layer — user feedback: blobs distracting, heavy black tint not the target look.

```css
.research-explorer {
  --research-glass-tint: rgba(6, 8, 14, 0.84);
  --research-glass-blur: 20px;
  --research-glass-saturate: 135%;
  --research-glass-border: rgba(255, 255, 255, 0.09);
  --research-glass-edge-highlight: rgba(255, 255, 255, 0.11);
  --research-glass-fallback: rgba(4, 5, 10, 0.94);
  --research-ambient-opacity: 0.38;

  background: transparent;
}

.research-explorer__glass {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: var(--research-glass-tint);
  backdrop-filter: blur(var(--research-glass-blur)) saturate(var(--research-glass-saturate));
  -webkit-backdrop-filter: blur(var(--research-glass-blur)) saturate(var(--research-glass-saturate));
  border: 1px solid var(--research-glass-border);
  box-shadow:
    inset 0 1px 0 var(--research-glass-edge-highlight),
    inset 0 0 0 1px rgba(0, 0, 0, 0.35);
}

.ambient-bg {
  opacity: var(--research-ambient-opacity);
  pointer-events: none;
}

.ambient-bg canvas {
  pointer-events: none;
}
```

**Intro form card (sunken trough + local glass):**

```css
.research-intro-inner {
  padding: 40px 44px;
  background: rgba(4, 6, 12, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 16px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  pointer-events: auto;
}

.ri-input {
  background: rgba(0, 0, 0, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.92);
}
```

**Traits:** ~84% dark tint — still reads as glass (blur + edge) but closer to §1 readability. Ambient at 38% opacity stops bloom from washing text.

---

## 4. Apple Liquid Glass — desktop blur, no blobs (current)

**Goal:** Apple-style frosted glass like the reference mockup — light frost, hairline edge, desktop blurred through the overlay. No Three.js ambient layer.

**Structure:**

```html
<div class="research-explorer">
  <div class="research-explorer__glass" aria-hidden="true" />  <!-- z-index 1 -->
  <!-- UI content z-index 2+ -->
</div>
```

```css
.research-explorer {
  --research-glass-blur: 24px;
  --research-glass-saturate: 155%;
  --research-glass-frost: rgba(255, 255, 255, 0.16);
  --research-glass-veil: rgba(12, 14, 20, 0.42);
  --research-glass-border: rgba(255, 255, 255, 0.22);
  --research-glass-edge-highlight: rgba(255, 255, 255, 0.28);
  --research-glass-fallback: rgba(16, 18, 26, 0.92);
  --research-glass-card-frost: rgba(255, 255, 255, 0.14);
  --research-glass-card-veil: rgba(10, 12, 18, 0.48);
  --research-glass-card-blur: 18px;
  --research-content-scrim: rgba(8, 10, 16, 0.22);

  background: transparent;
}

.research-explorer__glass {
  background:
    linear-gradient(145deg, var(--research-glass-frost) 0%, rgba(255,255,255,0.07) 48%, rgba(255,255,255,0.05) 100%),
    var(--research-glass-veil);
  backdrop-filter: blur(var(--research-glass-blur)) saturate(var(--research-glass-saturate));
  border: 1px solid var(--research-glass-border);
  box-shadow: inset 0 1px 0 var(--research-glass-edge-highlight);
}
```

**Intro card (glass-md tier):**

```css
.research-intro-inner {
  background:
    linear-gradient(160deg, var(--research-glass-card-frost), rgba(255,255,255,0.08)),
    var(--research-glass-card-veil);
  backdrop-filter: blur(18px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.20);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 12px 40px rgba(0, 0, 0, 0.28);
}

.ri-input {
  background: rgba(0, 0, 0, 0.28);  /* sunken trough for contrast */
}

.torrent-column::before {
  background: var(--research-content-scrim);  /* local column dim for torrent text */
}
```

**Traits:** Light white frost + stronger veil (~42%) — still glass, but desktop detail is softened and content columns get a local scrim. Saturation lowered to reduce colorful bleed.  
**Tuning knobs:** Raise `--research-glass-veil` toward `0.50` if still distracting; lower toward `0.35` for more transparency.

---

## Quick comparison

| Variant | Tint | Blur | Readability | Glass feel |
|---------|------|------|-------------|------------|
| §1 Solid dark | opaque | none | ★★★★★ | none |
| §2 Light glass | white 14% | 18px | ★★ | ★★★★★ |
| §3 Dark glass + blobs | charcoal 84% | 20px | ★★★★ | ★★★ |
| §4 Apple glass | white 16% + veil 42% | 24px | ★★★★★ | ★★★★ |

---

## Perplexity rules (reference)

- Blur: **12–24px** (above 30 = milky plastic)
- Tint opacity: **0.10–0.20** for light frosted cards; **0.70–0.90 dark tint** for full-screen data panels
- Saturation: **150–200%** on light glass; **120–140%** on dark panels
- Edge: `1px solid rgba(255,255,255,0.08–0.20)` + optional inset top highlight
- Never body text on raw unscrimmed glass — use card scrim or sunken inputs
