---
name: GOODLIFE Event Tickets
description: Premium mobile-first event ticketing and gate verification platform
colors:
  brand-navy: "#0F4C81"
  brand-navy-light: "#2B547E"
  brand-off-white: "#F9FBFD"
  brand-bg: "#F0F4F8"
typography:
  body:
    fontFamily: "system-ui, sans-serif"
    fontSize: "clamp(0.75rem, 1vw, 0.875rem)"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.05em"
  label:
    fontFamily: "system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 900
    lineHeight: 1.2
    letterSpacing: "0.1em"
  heading:
    fontFamily: "system-ui, sans-serif"
    fontSize: "clamp(1.25rem, 3vw, 1.75rem)"
    fontWeight: 900
    lineHeight: 1.1
    letterSpacing: "-0.02em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.brand-navy}"
    textColor: "{colors.brand-off-white}"
    rounded: "{rounded.lg}"
    padding: "16px 24px"
  button-primary-hover:
    backgroundColor: "{colors.brand-navy-light}"
  card-default:
    backgroundColor: "#ffffff"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg}"
  input-text:
    backgroundColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
    textColor: "{colors.brand-navy}"
---

# Design System: GOODLIFE Event Tickets

## 1. Overview

**Creative North Star: "The Security Gate Terminal"**

The interface of a physical access control terminal at a premium event venue. Every screen is a checkpoint. Every element has deliberate weight and purpose. Surfaces feel solid enough to press — thick borders, hard block shadows, dense information density, zero hesitation click-states. The aesthetic rejects both the soft corporate SaaS template and the dark dystopian nightclub gate. GOODLIFE is a daytime premium event: crisp, confident, unmistakable.

**Key Characteristics:**
- Heavy physicality: hard shadows (`#0F4C81` block shadows at 4-8px offset), 4px borders, no floating or ephemeral surfaces
- Decisive feedback: binary color states (green/red for pass/fail), no ghost buttons or skeleton loaders
- Uppercase dominance: all labels, badges, and CTAs are uppercase with tight tracking
- High contrast: brand navy on off-white, no low-contrast grey-on-grey
- Compact information density: small label text (`8-10px`) alongside bold value text (`12-16px`) — the gate operator needs to see everything at a glance

## 2. Colors

Four-color system rooted in a single dark navy primary. The palette is deliberately restrained — one accent, one light, one background — applied consistently.

### Primary
- **Brand Navy** (`#0F4C81`): The surface of all CTAs, primary buttons, component borders, block shadow color, header banners, and badge backgrounds. Carries 40-60% of significant surfaces. Never used for body text on light backgrounds (use brand-navy-light instead).

### Primary Light
- **Brand Navy Light** (`#2B547E`): Used for secondary text, muted labels, hover states, and decorative accents. Softer than brand-navy but maintains the same hue family.

### Neutral
- **Brand Off-White** (`#F9FBFD`): The text-on-dark color. Used for all text on brand-navy backgrounds, badge text, and as an alternate surface color.
- **Brand Background** (`#F0F4F8`): The page-level background. Slightly cooler than pure white, giving the canvas a subtle institutional feel.
- **White** (`#ffffff`): Card surfaces, input backgrounds, and modal content areas.
- **Slate** (`#64748b`, `#94a3b8`, `#cbd5e1`, `#e2e8f0`): Standard Tailwind slate scale for borders, dividers, secondary text, and muted states.

### Feedback
- **Green** (`#16a34a` / `#15803d` / `#166534` with `bg-green-50`, `border-green-200`): Admit/grant/success states. Always paired with green-50 background and green-200 border.
- **Red** (`#dc2626` / `#b91c1c` with `bg-red-50`, `border-red-200`): Reject/error/deny states. Always paired with red-50 background and red-200 border.

### Named Rules
**The Heavy Surface Rule.** Brand-navy is never used as a text color on off-white — it's a surface color. Text on brand-navy surfaces is always brand-off-white. When brand-navy text is needed on light backgrounds, use a badge or label pattern (color background + white text), never the inverse.

## 3. Typography

**Display Font:** System UI sans-serif (system-ui, -apple-system, Segoe UI, sans-serif)
**Body Font:** System UI sans-serif (same stack)
**Label/Mono Font:** Monospace for ticket IDs and receipt codes (`font-mono`)

**Character:** Bold, condensed, uppercase-heavy. The type does the work of layout — weight contrast (400/700/900) creates hierarchy where size alone shouldn't. Tracking (letter-spacing) is aggressive: `tracking-wider` (0.05em) on labels, `tracking-widest` (0.1em) on badges. No serif, no decorative typefaces on the web.

### Hierarchy
- **Heading / Display** (`font-black`, `900`, `clamp(1.25rem, 3vw, 1.75rem)`, `leading-none`): Event titles, section headers. Always uppercase with `tracking-tight`.
- **Body** (`font-bold`, `700`, `clamp(0.75rem, 1vw, 0.875rem)`): Paragraph content, descriptions, form labels. Always uppercase.
- **Label / Badge** (`font-black`, `900`, `0.625rem` / `0.5rem`, `tracking-widest`): Badges, status indicators, section subtitles, metadata labels. Always uppercase. The smallest size (8px) is for corner badges and timestamps only.
- **Mono** (`font-mono`, `text-xs` or `text-[10px]`): Ticket IDs (`GL-OJG3843XYZ`), receipt codes, phone numbers, timestamps.

### Named Rules
**The Weight Hierarchy Rule.** Hierarchy is primarily communicated through font weight (700 vs 900), secondarily through size. Never use `font-normal` (400) for body text — everything has weight.

## 4. Elevation

The system uses hard-edged block shadows as its primary elevation mechanism, not soft box-shadows or tonal layering. Depth is communicated through offset repetition of the brand-navy color, not through blur radius or opacity.

### Shadow Vocabulary
- **Gate CTA** (`shadow-[6px_6px_0px_0px_#0F4C81]`): The authoritative shadow for primary action panels (login form, admin cards). Creates the strongest sense of physical presence.
- **Card Hover** (`shadow-lg` hover transition): Subtle lift on interactive cards. Only appears as a state change — cards at rest are flat.

### Named Rules
**The Hard Shadow Rule.** All shadows are hard offsets of brand-navy with zero blur. The shadow IS the surface's physical extension, not a simulated light source. Soft shadows (`box-shadow` with blur) are forbidden — they violate the terminal aesthetic.

## 5. Components

### Buttons
- **Shape:** Rounded corners (`rounded-lg`, `rounded-xl`). Full width on mobile, content-width on desktop.
- **Primary:** Brand-navy background, brand-off-white text, border brand-navy. Hover shifts to brand-navy-light. Uses `transition-all duration-200` for state changes. Hard shadow (`shadow-md`) at rest.
- **Secondary / Outline:** Transparent background, brand-navy border, brand-navy text. Hover inverts to primary. No shadow.
- **Danger:** Red-700 background, white text. Used for cancel/delete/reject actions.
- **Disabled:** Slate-100 background, slate-400 text, no shadow, `cursor-not-allowed`.

### Cards / Containers
- **Corner Style:** Rounded-xl (16px). The largest radius in the system.
- **Background:** White (surface) or `bg-white/80 backdrop-blur-md` (over content areas).
- **Shadow Strategy:** No shadow at rest for content cards. Hard block shadow for gate/authentication panels only (see Elevation).
- **Border:** 1px `border-slate-200` for content cards. 4px `border-brand-navy` for gate panels.
- **Internal Padding:** `p-5` or `p-6` (20-24px) for content cards. `p-4` (16px) for compact/inner cards.

### Inputs / Fields
- **Style:** 1px `border-slate-200`, white background, rounded-xl (16px). Bold weight text, placeholder is slate-400.
- **Focus:** 2px `ring-brand-navy/30`, border shifts to brand-navy. No glow.
- **Error:** Red-600 text on red-50 background with red-200 border. Icon (AlertCircle) + message.
- **Disabled / Read-Only:** Slate-100 background, reduced text contrast.

### Navigation (Header)
- **Style:** Inline horizontal links, right-aligned on desktop. Dashboard link is outline style, Scanner link is primary style (navy bg + white text).
- **Brand:** Flame icon (lucide-react) in brand-navy square badge + "GOODLIFE" text in font-black uppercase.

### Chips / Tags
- **Primary tag:** Brand-navy background, brand-off-white text, 9px font-black uppercase, `rounded-full`. Used for "LIVE EVENT" badges.
- **Status badge:** Green background / Red background for pass/fail states, 8-9px font-black, with a 4px animated pulse dot for "live" indicators.
- **Tier badge:** Nested within tier selection cards. Inactive = brand-navy/15 background, brand-navy text. Active = brand-navy-light background, white text.

## 6. Do's and Don'ts

### Do:
- **Do** use brand-navy (`#0F4C81`) as the primary surface color for CTAs, badges, borders, and block shadows.
- **Do** use 4px borders and hard block shadows for gate/authority panels.
- **Do** make every interactive label uppercase with `tracking-widest` and `font-black`.
- **Do** use green/red binary feedback for pass/fail states with matching tinted backgrounds.
- **Do** keep touch targets at least 44x44px on mobile.
- **Do** use the full weight scale (900/700) to create hierarchy before reaching for size changes.

### Don't:
- **Don't** use ghost buttons, outline-only CTAs, or skeleton loaders — every action should look decisive.
- **Don't** use soft `box-shadow` with blur-radius as elevation — only hard block shadows are permitted.
- **Don't** use `font-normal` (400) for any body text or labels.
- **Don't** use gradient text, neon accents, or dark themes with electric colors.
- **Don't** use glassmorphism (`backdrop-blur`) as a default card treatment — it's reserved for overlay-on-image contexts only.
- **Don't** use border-left greater than 1px as a colored accent stripe on cards or list items.
- **Don't** use skeleton loaders, shimmer effects, or indeterminate progress bars — use decisive loading text with a spinner.
