---
name: creative-motion-typography
description: Award-winning web animation, GSAP ScrollTrigger, Lenis smooth scrolling, variable font dynamics, fluid clamp typography, kinetic text reveals, and micro-interaction physics.
---

# Creative Motion & Typography Skill

Use this skill when designing or implementing animations, page transitions, scroll choreographies, typography systems, and micro-interactions for high-end, award-winning websites (Awwwards, FWA, Apple/Stripe level polish).

---

## 1. The Core Creative Motion Stack

Award-winning sites do not use disjointed CSS transitions. They synchronize DOM scrolling, canvas updates, and text choreographies into a single coherent timeline.

### A. Lenis Smooth Scroll + GSAP Ticker Synchronization
Never let smooth scroll fight against your animation engine. Synchronize Lenis with GSAP's internal ticker:

```typescript
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function initSmoothScroll(): Lenis {
  const lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // Exponential ease-out
    orientation: 'vertical',
    smoothWheel: true,
  });

  // Update ScrollTrigger on every Lenis scroll tick
  lenis.on('scroll', ScrollTrigger.update);

  // Drive Lenis through GSAP ticker for single-loop efficiency
  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);

  return lenis;
}
```

### B. GSAP ScrollTrigger Choreography Patterns
- **Pinning & Scrollytelling**: Pin containers while scrubbing child timelines:
  ```typescript
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: '#hero-section',
      start: 'top top',
      end: '+=200%',
      pin: true,
      scrub: 1, // Smooth dampening
    }
  });
  tl.to('.hero-title', { scale: 1.4, opacity: 0, y: -80 })
    .from('.hero-card', { yPercent: 100, stagger: 0.1 }, '-=0.5');
  ```
- **Scrubbed Camera Dolly**: In 3D experiences, link `scrollTrigger` progress directly to camera rig positioning (`camera.position.z`).

---

## 2. Kinetic Typography & Variable Fonts

### A. Fluid Typography Formula
Never jump abruptly at fixed `@media` breakpoints. Use mathematical `clamp()` for uninterrupted scaling across mobile, tablet, and 4K screens:

```css
:root {
  /* Fluid Body: 16px at 375px up to 20px at 1920px */
  --font-size-body: clamp(1rem, 0.95rem + 0.26vw, 1.25rem);

  /* Fluid Display Heading: 42px at 375px up to 110px at 1920px */
  --font-size-display: clamp(2.625rem, 1.6rem + 4.4vw, 6.875rem);

  /* Fluid Subhead: 20px at 375px up to 32px at 1920px */
  --font-size-subhead: clamp(1.25rem, 1.1rem + 0.78vw, 2rem);
}
```

### B. Variable Font Axis Dynamic Modulation
Leverage variable font axes (`wght`, `wdth`, `slnt`, `ital`) to create kinetic, living type:
```typescript
// Dynamically weight typography based on mouse proximity or scroll velocity
function bindKineticType(element: HTMLElement, velocity: number): void {
  const weight = Math.min(900, Math.max(300, 400 + Math.abs(velocity) * 15));
  const slant = Math.min(12, Math.max(-12, velocity * 0.4));
  element.style.fontVariationSettings = `'wght' ${weight}, 'slnt' ${slant}`;
}
```

### C. Split-Type Mask Reveals
Never pop text onto the screen. Mask and stagger characters or words:
```typescript
// Staggered word mask reveal
gsap.from('.reveal-word', {
  yPercent: 120,
  opacity: 0,
  stagger: 0.035,
  duration: 0.85,
  ease: 'power3.out',
  scrollTrigger: {
    trigger: '.text-container',
    start: 'top 85%'
  }
});
```

---

## 3. Micro-Interactions & Magnetic Physics

### A. Magnetic Cursor Attractor
Elements with high priority (CTA buttons, hero links) physically attract the cursor toward their centroid:
```typescript
function attachMagneticPhysics(button: HTMLElement): void {
  button.addEventListener('mousemove', (e) => {
    const rect = button.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) * 0.35;
    const y = (e.clientY - rect.top - rect.height / 2) * 0.35;
    gsap.to(button, { x, y, duration: 0.3, ease: 'power2.out' });
  });

  button.addEventListener('mouseleave', () => {
    gsap.to(button, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
  });
}
```

---

## 4. Inclusivity & Accessibility Non-Negotiables

Always honor the user's motion preferences:
```css
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
In JavaScript, detect reduced motion via `window.matchMedia('(prefers-reduced-motion: reduce)').matches` and bypass scrubbed pinning for clean, static layouts.
