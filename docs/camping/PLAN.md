# Camping Availability System v2

## Architecture Overview

Scan recreation areas using a rotating schedule. Track availability patterns to calculate booking horizons. UI displays all 352 California recreation areas with filtering and favorites.

## Data Structure

**`Vivarium/camping/rec-areas.json`** - All 352 CA recreation areas
- Fields: `id`, `name`, `latitude`, `longitude`, `driveTimeHours`
- Scan state: `lastScanned`, `bookingHorizon`, `recentWeekendAvailability`
- Populated once via matching script (already exists)

**`Vivarium/camping/favorites.json`** - User preferences
- `favorites`: array of rec area IDs (max 4)
- `disabled`: array of rec area IDs removed from rotation
- `settings`:
  - `dailyScanEnabled`: boolean
  - `notificationsEnabled`: boolean (default false)

**`Vivarium/camping/availability.json`** - Latest scan results

**`Vivarium/camping/scan-state.json`** - Rotation tracking
- `currentIndex`: position in ordered rec area list
- `sitesPerRun`: configurable (default 4)
- `favesPerDay`: configurable (default 6)

## Scanning Logic

**Scan Frequency**
- If favorites exist (1-4 sites): scan favorites at fave scan rate
- If no favorites: scan all-sites rotation at fave scan rate (moves through list faster)

**Rotating Schedule** - `me/scripts/check-camping.py`
- Static ordered list of rec areas (sorted by ID for determinism)
- Excludes areas in `disabled` array
- Each run: scan `sitesPerRun` areas starting from `currentIndex`
- On success: increment `currentIndex`, update `lastScanned` timestamps
- On failure: don't update index, next run retries same areas

**Booking Horizon Calculation**
- Find available weekends in scan results
- Average days from today (or "no data" if none found)
- Store in `rec-areas.json` per area

## UI Components

**`me/docs/camping/camping.tsx`**

Two tabs: "All Areas" | "Favorites"
- All Areas: shows all 352 rec areas, sorted by `lastScanned`
- Favorites: shows only favorited areas (empty if none)

**Drive Time Filter**
- Two-point slider (min/max hours, like activities page)
- When active, re-sorts results by drive time ascending

**Search Bar** - Client-side filtering by name

**Per-Area Controls**
- Favorite button (heart icon) - max 4 favorites enforced in UI
- Disable toggle - removes from rotation, grays out card, sorts to bottom

**Global Settings (in UI)**
- Daily scan toggle (on/off)
- Notifications toggle (on/off, default off)

**Disabled Areas**
- Grayed out appearance
- Always sorted to bottom of list (regardless of other sort criteria)
- Toggle to re-enable

## Notifications

Channel: Discord webhook

**Monthly Digest (all-sites rotation)**
- Sent once per month
- Metrics:
  - Total sites scanned
  - Number of runs failing to finish (with links to github actions)
  - Number of available weekends found
  - Number of sites with no availability
- Top sites with highest availability
- Rate limit visibility: log error codes and responses for diagnosis

**Immediate Alerts (favorites)**
- Triggered when favorited site has new availability
- Quiet hours: 12am-8am Pacific
- State stored per-site in `rec-areas.json`:
  - `notified`: boolean - false means "pending notification"
  - `lastNotifiedAt`: timestamp of last notification
- Logic:
  - New availability during waking hours → notify, set `notified: true`
  - New availability during quiet hours → set `notified: false`, don't send
  - Next waking-hours job → find all `notified: false`, send notifications, set to true
  - If new availability overwrites old → notify anyway (it's new info)
- De-duplication: only notify if availability data has actually changed

**Error Logging**
- All API errors logged with full error codes and response bodies
- Rate limit responses captured and logged
- Errors surfaced in monthly digest

## Testing Architecture

**Testing Mode** - `check-camping.py` should support CLI arguments for testing:
- `--sites`: comma-separated list of specific rec area IDs to scan
- `--start-date` / `--end-date`: override default date range
- `--dry-run`: run without committing changes or sending notifications
- `--verbose`: extra logging for debugging

Example: `python check-camping.py --sites 1234,5678 --start-date 2025-01-01 --end-date 2025-02-01 --dry-run`

This allows testing specific scenarios without affecting production state or triggering real notifications.

## Commit Strategy

All state lives in Vivarium repo. Commits are acceptable at any scale.

- **User actions**: Commit to `favorites.json` on each toggle
- **Scan runs**: One commit per successful run containing:
  - Updated `availability.json` (new results)
  - Updated `rec-areas.json` (lastScanned, bookingHorizon)
  - Updated `scan-state.json` (currentIndex incremented)

## Key Files

- `Vivarium/camping/rec-areas.json` - Area data + scan state
- `Vivarium/camping/favorites.json` - User preferences
- `Vivarium/camping/availability.json` - Scan results
- `Vivarium/camping/scan-state.json` - Rotation tracking
- `me/scripts/check-camping.py` - Scanning logic
- `me/.github/workflows/camping-monitor.yml` - GitHub Action
- `me/docs/camping/camping.tsx` - UI

## Implementation Phases

### Phase 1: Data Foundation
1. Run matching script to populate full `rec-areas.json` with all 352 CA areas
2. Create `scan-state.json` with initial values
3. Update `check-camping.py` with rotating schedule logic

### Phase 2: GitHub Action
1. Update `camping-monitor.yml` to use new scanning logic
2. Handle favorites vs all-sites mode
3. Implement commit logic for successful runs

### Phase 3: UI
1. Build two-tab layout (All Areas | Favorites)
2. Implement two-point drive time slider
3. Add search bar filtering
4. Add favorite button (max 4) and disable toggle per area
5. Display booking horizon and last scanned info
6. Disabled areas: gray styling, sort to bottom

### Phase 4: Polish
1. Error handling and retry logic
2. Loading states and feedback
3. Discord notification infrastructure (disabled initially)

