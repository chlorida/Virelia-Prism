# Discover Personalization, Search Ranking & Unified Detail Shell

## Goal

Deliver a YouTube-like personalized Discover experience, fix search ranking (adult/low-relevance results above popular titles), infinite scroll in both axes, animated sidebar expand/collapse, and a single cinematic detail screen for library and catalog titles.

## Decisions (validated with user)

| Topic | Decision |
|-------|----------|
| Recommendations signals | Local watch history + watchlist + favorites (not search/click telemetry) |
| Adult content (off) | Completely hidden from search, Discover, and For you |
| Adult content onboarding | Explicit question on first-run wizard with warning copy; default off |
| Catalog detail UI | Same hero shell as library; adapted actions; no Files tab |
| Infinite scroll | Horizontal rails + vertical section feed |
| Sidebar peek delay | **100 ms** (was 300 ms) |
| Architecture | Foundation-first unified services; no parallel legacy paths |
| Search section 1 | Approved |
| Recommendations section 2 | Approved |
| Infinite scroll + detail shell sections 3–4 | Approved |

---

## Architecture

Build shared service layers first, then migrate all UI consumers in one implementation cycle. Do **not** leave `CatalogTitlePage` or old Discover pipelines running in parallel.

```
┌─────────────────────────────────────────────────────────┐
│  UI: DiscoverFeed · MediaDetailShell · SmartRightPanel  │
├─────────────────────────────────────────────────────────┤
│  contentPolicyService      — adult filter, settings     │
│  searchRankingService      — relevance + popularity     │
│  userAffinityService       — genre/title/franchise weights │
│  discoverFeedService       — vertical + horizontal feed │
├─────────────────────────────────────────────────────────┤
│  Providers: AniList · TMDB · TVMaze · local library     │
└─────────────────────────────────────────────────────────┘
```

### New / refactored units

| Unit | Responsibility |
|------|----------------|
| `contentPolicyService` | Single boundary filter for `includeAdultContent`; provider flags + post-filter heuristics |
| `searchRankingService` | `rankSearchResults(query, results, settings)` — relevance × popularity |
| `userAffinityService` | Compute `genreWeights`, `titleWeights`, `franchiseWeights` from history, watchlist, favorites |
| `discoverFeedService` | Section ordering, vertical cursor, horizontal page fetch per section |
| `DiscoverFeed` | Vertical infinite page composing `DiscoverFeedSection` rows |
| `DiscoverInfiniteRail` | Horizontal infinite rail with intersection-observer sentinel |
| `MediaDetailShell` | Unified detail UI; modes `local` \| `catalog` |
| `FirstRunWizard` (library step) | Adult content toggle + warning copy (en/ru) |

### Removed after migration

| Unit | Replacement |
|------|-------------|
| `CatalogTitlePage` | `MediaDetailShell` mode `catalog` |
| `DiscoverScrollRail` (finite) | `DiscoverInfiniteRail` |
| Popularity-only sort in search merge | `searchRankingService` |

---

## 1. Search ranking & adult content

### Problem

Results are sorted by `popularity` only (`metadataMergeUtils.sortResultsByPopularity`). Query relevance is ignored, so niche adult OVAs can outrank mainstream titles (e.g. "sailor" → "Sexy Sailor Soldiers" above "Sailor Moon").

### Ranking formula

```
finalScore = relevance(query, title) * 0.6
           + popularityNorm(title) * 0.3
           + providerConfidence * 0.1
```

**Relevance factors:**
- Token overlap between query and title / originalTitle
- Prefix match on tokens (strong boost)
- Word-order bonus for multi-word queries ("sailor moon")
- Tie-breakers: has poster, richer overview, higher confidence

Apply in `searchRankingService`; call from `catalogSearchService` and `mergeDuplicateResults` final pass.

### Adult content policy (`contentPolicyService`)

When `discovery.includeAdultContent === false`:

1. **Provider level:** AniList `isAdult: false`, TMDB `include_adult: false`
2. **Post-filter:** drop items with `isAdult`, adult genre tags (`hentai`, etc.), adult keyword heuristics in title
3. **TVMaze:** no native flag — apply heuristics + genre blocklist; when uncertain, exclude
4. **Surfaces:** search online results, Discover rails, For you tab, related titles on detail shell

When `true`: no post-filter; provider flags request adult-inclusive results.

### Onboarding (first-run wizard)

Add toggle on existing **library / basics** step (`FirstRunWizard`, step id `library`):

**Copy requirements (en + ru in `onboardingCopy.ts` + shared i18n):**
- Title: adult content (18+)
- Explain what 18+ catalog content means in Discover/search
- State clearly: when off, such titles **never appear** in search or recommendations
- Note: can be changed later in Settings → Discovery
- Default: **off** → saves `discovery.includeAdultContent: false`

---

## 2. Recommendations (YouTube-like)

### Affinity profile (`userAffinityService`)

| Signal | Weight | Calculation |
|--------|--------|-------------|
| Watch history | High | `(resumePositionSeconds / durationSeconds) × recencyDecay(days)` summed per title/genre |
| Watchlist | Very high | +1.0 per title |
| Favorites | High | +0.8 per favorited media item (mapped to title) |

**Outputs:**
- `genreWeights: Record<string, number>` — normalized
- `titleWeights: Map<string, number>` — by local title id and catalog id when known
- `franchiseWeights: Map<string, number>`

Recompute on library/media/watchlist/favorites change (debounce ~2 s). Cache in memory; invalidate on settings change.

**Recency decay:** exponential, ~30-day half-life on watch events.

### Discover vertical section order

1. Continue watching (local, in-progress)
2. Because you watched X (franchise / genre related)
3. Your top genres — genre rails ordered by `genreWeights` descending
4. For you — mixed local + online, score = `affinity×0.5 + popularity×0.3 + novelty×0.2`
5. Trending / Popular (neutral)
6. Remaining genres — loaded on vertical scroll

**Cold start** (empty profile): Trending → Popular by type → default genre order until first watch event.

### SmartRightPanel "For you" tab

Reuse `discoverFeedService` in `compact` mode:
- One hero continue card (if any)
- 4–6 ranked mini-cards
- Click → `MediaDetailShell`

### Out of scope (v1)

- ML / collaborative filtering
- Cloud sync of affinity profile
- Search-query or click telemetry for ranking

---

## 3. Infinite scroll

### Vertical feed (`DiscoverFeed`)

- `DiscoverPage` becomes thin wrapper over `DiscoverFeed`
- `IntersectionObserver` sentinel at bottom (rootMargin ~400px)
- `discoverFeedService.getNextSections(cursor)` returns 2–3 sections per call
- Cursor: `{ phase, genreIndex, page }` — phases: `personal → affinityGenres → trending → remainingGenres`
- Skip genres already shown in affinity block
- Loading: skeleton rail; errors: silent retry, non-blocking

### Horizontal rails (`DiscoverInfiniteRail`)

| Parameter | Value |
|-----------|---------|
| Initial items | 16 |
| Page size | +12 |
| Trigger | Sentinel at right edge, threshold 0.6 |
| End of data | Stop loading; hide/disable forward arrow |
| Dedup | By `catalogId` / `localTitleId` within section |
| Sort new page | affinity × popularity |

**Per-section data sources:**
- `genre:*` — AniList/TMDB/TVMaze with genre filter + page param
- `trending` — trending endpoint + page
- `local:*` — library only, no online pagination
- `for-you` — local candidates first, then online by top genres

**Cache:** `discover:{sectionId}:page:{n}` in `metadataCache`, existing discover TTL.

### Watchlist

Same `DiscoverInfiniteRail` + `MediaDetailShell` on card click.

---

## 4. MediaDetailShell & sidebar animation

### MediaDetailShell

```typescript
type MediaDetailMode = 'local' | 'catalog';
```

**Shared UI** (from current `TitleDetailPanel`):
- `LibraryContextNav` + breadcrumbs
- Hero: backdrop (ken-burns), poster, genre pills, rating, episode count
- Synopsis with expand
- Tab framework from `TitleDetailDeepTabs`
- Motion: `prism-page-enter`, hero crossfade, stat enter, stagger on episode list

**Mode `local`:**
- Actions: Start series, Refresh metadata, Back to franchise
- Tabs: Episodes, Media, Characters, Explore, Files

**Mode `catalog`:**
- Actions: Add to watchlist, Where to watch, Search online
- If title exists in library: show Open in library / switch to local mode
- Tabs: Episodes, Related, Watch options (no Files)
- Data: `fetchCatalogTitleDetails`, catalog seasons/episodes

**Routing (`LibraryRouter`):**
- `route.page === 'title'` → `MediaDetailShell` local
- `route.page === 'catalog*'` → `MediaDetailShell` catalog
- Remove `CatalogTitlePage` import and file

**Open animation:** existing `LibraryPageEnter` + hero crossfade 340ms + stagger 40ms on poster/title.

### Sidebar animation

| Parameter | Value |
|-----------|---------|
| Hover peek delay | **100 ms** |
| Width transition | 280 ms ease-out on grid `--sidebar-width` |
| Label fade-in | opacity 0→1, 200 ms, delay 60 ms on expand |
| Collapse on mouse leave | 220 ms reverse |
| Pinned (collapsed toggled) | No hover peek |

Update `LibraryPanel.tsx` timer 300→100. Add CSS transitions in `layout.css` / `shell-chrome.css` for width and label opacity. Keep `library-panel--peek` z-index/shadow behavior.

---

## 5. Implementation order

1. **Foundation services** — `contentPolicyService`, `searchRankingService`, `userAffinityService`
2. **Search + onboarding** — ranking integration, adult filter, wizard copy
3. **Discover feed** — `discoverFeedService`, `DiscoverFeed`, `DiscoverInfiniteRail`, migrate `DiscoverPage`
4. **SmartRightPanel** — For you tab wired to feed service
5. **MediaDetailShell** — extract from `TitleDetailPanel`, add catalog mode, update `LibraryRouter`, delete `CatalogTitlePage`
6. **Sidebar motion** — 100 ms delay + width/opacity transitions
7. **Watchlist** — align card click and rails with new shell/feed

---

## Data flow

### Search

```
CatalogSearchPanel → runCatalogSearch → providers
  → mergeDuplicateResults → contentPolicyService.filter
  → searchRankingService.rank → UI
```

### Discover

```
DiscoverFeed → discoverFeedService.getSections(cursor)
  → userAffinityService (order + score)
  → contentPolicyService.filter
  → DiscoverInfiniteRail (horizontal pages)
```

### Card click

```
CatalogShelfCard → navigateToCatalogTitle / navigateToLocalTitle
  → LibraryRouter → MediaDetailShell (mode by route)
```

---

## Error handling

- Provider timeout/failure: section/rail shows partial results; retry next page only
- Empty affinity: cold-start section order
- Catalog detail load failure: hero skeleton → error state with retry + back
- Adult filter false positive: user can enable 18+ in Settings (documented in onboarding)

---

## Testing

| Area | Tests |
|------|-------|
| `searchRankingService` | "sailor" ranks Sailor Moon above adult OVA fixtures; relevance tie-breaks |
| `contentPolicyService` | Filters adult tagged items when off; passes when on |
| `userAffinityService` | Genre weights from mock watch history; watchlist/favorites boost |
| `discoverFeedService` | Section order with/without profile; cursor pagination no duplicates |
| Integration | Typecheck; manual: search "sailor", Discover scroll both axes, catalog card → shell, sidebar 100 ms peek |

---

## i18n keys (new)

- `onboarding.adultContent.title`, `.body`, `.hint`, `.toggleLabel`
- `discover.feed.loading`, `discover.feed.loadMore`
- `mediaDetail.catalog.addWatchlist`, `.whereToWatch`, `.searchOnline`, `.openInLibrary`
- Extend en + ru in `shared/i18n.ts` and `onboardingCopy.ts`

---

## Files touched (expected)

**New:**
- `src/renderer/lib/metadata/contentPolicyService.ts`
- `src/renderer/lib/metadata/searchRankingService.ts`
- `src/renderer/lib/metadata/userAffinityService.ts`
- `src/renderer/lib/metadata/discoverFeedService.ts`
- `src/renderer/components/library/DiscoverFeed.tsx`
- `src/renderer/components/library/DiscoverInfiniteRail.tsx`
- `src/renderer/components/MediaDetailShell.tsx`

**Modified:**
- `metadataMergeUtils.ts`, `catalogSearchService.ts`, `discoverCatalogService.ts`
- `recommendationService.ts` (delegate to affinity/feed or slim down)
- `DiscoverPage.tsx`, `WatchlistPage.tsx`, `LibraryRouter.tsx`
- `TitleDetailPanel.tsx` (extract shared parts into shell)
- `SmartRightPanel.tsx`, `LibraryPanel.tsx`
- `FirstRunWizard.tsx`, `onboardingCopy.ts`, `SettingsModal.tsx`
- `layout.css`, `shell-chrome.css`, `motion.css`
- `shared/i18n.ts`, `shared/defaults.ts`

**Deleted:**
- `src/renderer/features/library/pages/CatalogTitlePage.tsx`
- `src/renderer/components/library/DiscoverScrollRail.tsx` (after rail replacement)
