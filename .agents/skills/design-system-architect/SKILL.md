---
name: design-system-architect
description: Enterprise & creative design system architecture, modern CSS (@container, @layer), fluid design tokens, OKLCH color spaces, multi-device responsiveness, and component boundaries.
---

# Design System Architect Skill

Use this skill when designing or restructuring UI systems, component libraries, responsive layouts, design token architectures, and multi-device interaction models (mobile, tablet, 4K desktop, touch, and gamepad).

---

## 1. Architectural Philosophy: The Adaptive Design Token System

A world-class design system does not use hardcoded hex values, arbitrary pixel margins, or fragile viewport media queries. It builds on three pillars:
1. **Perceptually Uniform Color Spaces (OKLCH)**: Guarantees consistent perceived brightness and contrast across dark and light palettes.
2. **Fluid Mathematical Spacing**: Spacing and type scales calculate dynamically between bounds using CSS `clamp()`.
3. **Container-Aware Components**: Components respond to their parent container dimensions (`@container`), making them universally portable anywhere in the app.

---

## 2. Design Token Architecture (CSS Custom Properties)

```css
@layer tokens, reset, base, components, utilities;

@layer tokens {
  :root {
    /* ── OKLCH Palette (Lightness, Chroma, Hue) ────────────────────────── */
    --color-bg-base: oklch(0.12 0.02 260);
    --color-bg-elevated: oklch(0.18 0.03 260);
    --color-surface-glass: oklch(0.22 0.03 260 / 0.65);
    
    --color-accent: oklch(0.85 0.18 200);       /* Vibrant Cyber Cyan */
    --color-accent-glow: oklch(0.85 0.18 200 / 0.35);
    --color-warn: oklch(0.82 0.16 85);          /* Amber Gold */
    --color-danger: oklch(0.65 0.24 25);        /* High-Impact Red */
    
    --color-text-primary: oklch(0.96 0.01 260);
    --color-text-muted: oklch(0.68 0.02 260);

    /* ── Fluid Spacing Scale ─────────────────────────────────────────── */
    --space-xs: clamp(0.25rem, 0.2rem + 0.2vw, 0.375rem);
    --space-sm: clamp(0.5rem, 0.4rem + 0.4vw, 0.75rem);
    --space-md: clamp(1rem, 0.85rem + 0.6vw, 1.5rem);
    --space-lg: clamp(1.5rem, 1.25rem + 1.0vw, 2.25rem);
    --space-xl: clamp(2.5rem, 2.0rem + 2.0vw, 4.0rem);

    /* ── Radii & Blurs ───────────────────────────────────────────────── */
    --radius-sm: 6px;
    --radius-md: 12px;
    --radius-full: 9999px;
    --blur-glass: 16px;
  }
}
```

---

## 3. Container Queries & Fluid Responsiveness

Never write a card component that only works on desktop. Use container queries so components adapt whether placed in a narrow sidebar or a full-width hero:

```css
/* Define container context on parent */
.card-container {
  container-type: inline-size;
  container-name: card;
}

/* Component adapts to its own width, NOT window width */
.interactive-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: var(--color-surface-glass);
  backdrop-filter: blur(var(--blur-glass));
  border: 1px solid oklch(1 0 0 / 0.1);
  border-radius: var(--radius-md);
}

@container card (min-width: 520px) {
  .interactive-card {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}
```

---

## 4. Multi-Input Ergonomics (Touch, Mouse, Gamepad)

Award-winning sites operate seamlessly regardless of whether the user is on an iPhone, trackpad, mechanical keyboard, or gamepad:

1. **Touch Target Sizing**: Minimum interactive surface of $44\text{px}\times 44\text{px}$ (WCAG AAA recommendation: $48\text{px}\times 48\text{px}$):
   ```css
   button, a, input[type="button"] {
     min-height: 48px;
     min-width: 48px;
     display: inline-flex;
     align-items: center;
     justify-content: center;
   }
   ```
2. **Spatial Focus Management**:
   ```css
   :focus-visible {
     outline: 2px solid var(--color-accent);
     outline-offset: 4px;
     box-shadow: 0 0 16px var(--color-accent-glow);
   }
   ```

---

## 5. Architectural Boundaries

- **Separation of Concerns**: Presentation UI never mutates core simulation/engine state directly.
- **Normalized Event Bus**: Inputs (touch taps, mouse clicks, keys, gamepad buttons) emit generic semantic actions (`SELECT`, `BACK`, `BOOST`), keeping UI components completely decoupled from hardware drivers.
