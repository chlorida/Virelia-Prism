# Unified Motion System Design

## Goal

Deliver a **unified motion system** across the entire Virelia Prism app: subtle micro-interactions for everyday controls, expressive transitions for structural changes (panels, pages, modals), and enter/exit animations when list items are added or removed—without new dependencies or layout shift.

## Decisions (validated with user)

| Topic | Decision |
|-------|----------|
| Scope | Full app pass — all appropriate user actions |
| Character | **Hybrid**: micro 120–180ms for hover/press; structural 280ms for panels/pages/modals; cinematic 340–420ms + stagger for first section appearance |
| Dynamic lists | Section stagger on first load **plus** enter/exit when items are added or removed (queue, watchlist, playlist chips) |
| Approach | Extend existing Prism Motion System (CSS tokens + `AnimatedListItem`); **no** Framer Motion |
| Virtualized content | Section-level stagger only; no per-row animation in virtualized grids/rails |

## Architecture

### Layer model

```
motion.css              → tokens, keyframes, presence classes (existing, extended)
motion-interactions.css → hover / press / glow / list-item utilities (new)
shell-chrome.css        → sidebar, nav, right panel (augment)
theme.css               → buttons, chips, inputs (unify transitions)
AnimatedListItem.tsx    → enter/exit wrapper for DOM-stable lists (new)
motionCatalog.ts        → duration/easing constants for tests (new)
```

### Motion tokens

| Token | Value | Use |
|-------|-------|-----|
| `--motion-duration-micro` | 120ms | hover, press, toggle |
| `--motion-duration-fast` | 180ms | buttons, chips, tab underline |
| `--motion-duration-base` | 280ms | panels, drawer, page enter |
| `--motion-duration-slow` | 420ms | hero, stagger, cinematic |
| `--motion-ease-out` | cubic-bezier(0.22, 1, 0.36, 1) | enter |
| `--motion-ease-in` | cubic-bezier(0.4, 0, 1, 1) | exit |
| `--motion-lift-hover` | translateY(-2px) | buttons, cards |
| `--motion-scale-press` | scale(0.97) | active/click |

### Utility classes

| Class | Purpose |
|-------|---------|
| `.prism-motion-interactive` | Base transition on all clickable elements |
| `.prism-motion-lift` | Hover lift via `transform` only (no layout shift) |
| `.prism-motion-glow` | Border/box-shadow fade on hover |
| `.prism-motion-list-enter` | Fade + slide-up 8px on list item mount |
| `.prism-motion-list-exit` | Fade + slide-left 8px on list item unmount |

### Layout-shift rule

Animate only `transform`, `opacity`, `box-shadow`, `border-color`, and `max-width` (sidebar labels). Shell grid may animate `grid-template-columns`. Never animate content `width`/`height` inside the center column.

## Action catalog

### Shell chrome

| Action | Animation | Duration |
|--------|-----------|----------|
| Sidebar rail → peek | `grid-template-columns` + label `opacity`/`max-width` + content fade-in | 280ms enter / 90ms exit labels |
| Nav item hover | background + border glow + icon opacity | 140ms |
| Workspace tab hover/active | background fade + `::after` underline `scaleX` | 180ms / 280ms |
| Right panel docked ↔ drawer | panel opacity crossfade; drawer `translateX` | 280ms |
| Queue drawer open/close | `translateX` + `opacity` (unify existing partial impl) | 280ms |
| Layout toggle buttons | press `scale(0.97)` + active glow | 120ms |
| Glass dropdown open | `PopoverAnimatedPresence` scale-in | 240ms spring |
| App backdrop (drawer open) | `prism-backdrop-in/out` | 220ms |

**Constraint:** Right panel must not disappear when hovering the left sidebar. Panel animations are isolated; no cross-panel CSS `:has()` side effects.

### Modals and overlays

All modals already use `ModalAnimatedPresence` / `AnimatedPresence`. Task: align exit durations and ensure no instant unmount.

| Component | Enter | Exit |
|-----------|-------|------|
| Settings, Prompt, BrowserWarning, FirstRunWizard | scale-in | scale-out 180ms |
| GlobalSearchOverlay | backdrop + panel | 220ms unified |
| ContextMenu | popover spring | 160ms |
| DropOverlay | fade | 180ms |
| ToastStack | slide-right-in | slide-down-out |

### Content / library

| Action | Animation |
|--------|-----------|
| Workspace route change | `prism-page-enter` / `--back` via `LibraryPageEnter` |
| First grid/rail load | `prism-stagger-grid` / `prism-stagger-rail` (40ms step, max 200ms delay) |
| Title card hover | lift + poster scale 1.03 + shadow | 180ms |
| Title card press | scale(0.98) | 120ms |
| Media row hover | border glow + actions opacity fade-in | 140ms |
| Tab switch | `prism-tab-content-enter` | 280ms |
| Tab underline active | `::after` scaleX 0→1 | 280ms |
| Filter chips / shell-segment | background + border crossfade | 140ms |
| Empty state appear | fade + slide-up 12px | 280ms |

**Do not animate:** scroll of already-visible virtualized cards; repeat fetch of the same page.

### Player / watch mode

| Action | Animation |
|--------|-----------|
| Enter watch mode | `watchEnter` 150ms + `watch-main-host--enter` | 400ms |
| Exit watch mode | `media-list-host--exit` fade | 400ms |
| Playback bar show/hide | `playback-bar--enter` slide-up | 360ms |
| Track info change | crossfade | 240ms |
| Video controls show (cinema hover) | opacity | 120ms |
| Up Next card hover | lift + border glow | 130ms |
| Speed/subtitle menu | popover + item hover | 140ms |
| Video end screen | scale-in panel | 280ms |

### List mutations (`AnimatedListItem`)

Wrap DOM-stable lists only (not virtualized grid rows).

| List | Enter | Exit |
|------|-------|------|
| Queue (`queue-item`) | fade + slide-up 8px | fade + slide-left 8px |
| Watchlist rows | fade + scale 0.98→1 | fade + height collapse |
| Playlist chips | scale-in 0.95 | scale-out + opacity |
| Search results (live) | enter per new row | exit on clear |

Exit flow: `phase: exit` → `animationend` → DOM remove (or parent callback after 180ms timeout).

### Global micro-interactions

Apply `.prism-motion-interactive` + `.prism-motion-lift` to:

`ghost-button`, `pill-button`, `primary-action`, `nav-item`, `playlist-chip`, `shell-segment`, `icon-button`, `vc-icon-btn`, `glass-dropdown__trigger`, `queue-item`, `up-next-card`, `smart-tab-pill`, `catalog-title-tab`, `settings-tab`, `search-palette__tab`.

Press: `:active { transform: scale(0.97) }` at 120ms. Focus rings remain instant per `focus-states.css`.

## `AnimatedListItem` contract

```ts
interface AnimatedListItemProps {
  itemKey: string;
  className?: string;
  exitDurationMs?: number;  // default 180
  onExitComplete?: () => void;
  children: ReactNode;
}
```

Integration points:

- `QueuePanel.tsx` / `SmartRightPanel` queue tab
- `WatchlistPage` rows
- `LibraryPanel` playlist stack

## Accessibility and performance

### `prefers-reduced-motion`

Single consolidated block in `motion-interactions.css` (extend `motion.css` block, do not duplicate). Ambient loops (shimmer, pulse, ken-burns) → `animation: none`. `useAnimatedPresence` already skips phases when reduced motion is on.

### Performance rules

- Hover uses `transform` + `opacity` only
- No global `will-change`; optional on drawer/panel during active transition only
- Virtualized grids: section stagger only
- Max 5 simultaneous list exit animations; remainder instant remove
- Extend `perfTransitions.ts` with `list-item-enter` and `panel-toggle` marks for dev profiling

## Edge cases

| Situation | Behavior |
|-----------|----------|
| Rapid drawer open/close | CSS transition reverses naturally; no debounce |
| Sidebar peek + right panel open | Independent z-index and animation |
| Item removed during exit | Stable `itemKey`; duplicate remove ignored |
| Shimmer + lift on primary-action | Lift on `:hover:not(:disabled)` only; shimmer `::before` unaffected |

## Testing

### Unit (vitest)

- `AnimatedListItem`: enter class applied; exit calls `onExitComplete`
- `useAnimatedPresence`: reduced motion skips phases

### Visual QA (`docs/MOTION_QA.md`)

- Sidebar peek enter/exit
- Right panel drawer slide; no disappear on left hover
- Queue add/remove (3 items)
- Watchlist add/remove
- Route library → discover → back
- Settings modal open/close
- Watch mode enter/exit
- `prefers-reduced-motion: reduce` — all instant

No screenshot CI at this stage.

## Rollout (4 phases)

| Phase | Scope | PR |
|-------|-------|-----|
| 1 — Foundation | `motion-interactions.css`, tokens, global micro-interactions on buttons/chips | 1 |
| 2 — Shell | Sidebar peek, right panel/drawer, backdrop, nav tabs | 1 |
| 3 — Content | Cards, tabs, page enter gaps, filter chips, search rows | 1 |
| 4 — Lists + Player | `AnimatedListItem`, queue/watchlist/playlist, player controls | 1 |

Each phase is independently shippable.

## Files touched (summary)

| File | Change |
|------|--------|
| `src/renderer/styles/motion.css` | New tokens, list keyframes |
| `src/renderer/styles/motion-interactions.css` | New file |
| `src/renderer/styles/shell-chrome.css` | Panel/sidebar motion gaps |
| `src/renderer/styles/theme.css` | Unify button transitions |
| `src/renderer/styles/title-interactions.css` | Card hover/press |
| `src/renderer/styles/layout.css` | Drawer timing alignment |
| `src/renderer/styles/watch-cinema.css` | Player control gaps |
| `src/renderer/components/AnimatedListItem.tsx` | New file |
| `src/renderer/lib/motionCatalog.ts` | New file |
| `src/renderer/lib/perfTransitions.ts` | New transition marks |
| `docs/MOTION_QA.md` | New QA checklist |

## Out of scope

- Framer Motion or other animation libraries
- Per-row animation in `@tanstack/react-virtual` lists
- Scroll-reveal on infinite scroll
- Screenshot/visual regression CI
- `matchMedia` listener for mid-session reduced-motion change (P2)
