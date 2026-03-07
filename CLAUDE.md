# CLAUDE.md — Family Coordinator

## Project Overview

**Family Coordinator** (v8.4) is a single-file React web application for coordinating family schedules, tasks, and grocery shopping. It is designed for two parents managing a child's daycare schedule and household duties.

The entire application lives in **one file**: `index.html`. There is no build step, no package manager, and no server-side code in this repository.

## Architecture

### Single-File Stack

| Concern | Technology | Loaded via |
|---|---|---|
| UI Framework | React 18.2.0 | CDN (`cdnjs.cloudflare.com`) |
| JSX Compilation | Babel Standalone 7.23.5 | CDN (`cdnjs.cloudflare.com`) |
| Styling | Tailwind CSS | CDN (`cdn.tailwindcss.com`) |
| AI Features | Claude API (claude-sonnet-4-20250514) | Cloudflare Worker proxy |
| Data Persistence | Google Sheets | Google Apps Script |

### External Service Dependencies

All external endpoints are defined as constants at the top of the `<script>` block:

```javascript
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/...";  // Google Apps Script
const WORKER_URL        = "https://aged-dust-551a.zevallos-fg.workers.dev"; // Cloudflare Worker
const SYNC_INTERVAL     = 5000; // ms between auto-syncs
```

- **Cloudflare Worker** (`WORKER_URL`): Acts as a CORS proxy for all Claude API calls. All `callClaude()` calls go through this worker, not directly to the Anthropic API.
- **Google Apps Script** (`GOOGLE_SCRIPT_URL`): Provides GET (read all data) and POST (write all data) endpoints backed by Google Sheets. Auto-creates sheets named: `Schedule`, `MentalDump`, `Groceries`, `Categories`, `Stores`.

## Application Structure

The single `FamilyCoordinator` component manages four tabs:

| Tab ID | Purpose |
|---|---|
| `schedule` | Upload parent calendar screenshots → Claude analyzes and assigns daycare duties |
| `dump` | Voice/text capture → Claude routes to grocery list or task list |
| `organized` | View and manage categorized tasks |
| `grocery` | Shopping list organized by store |

## Key Constants

```javascript
// Time windows used for conflict detection in schedule analysis
const DROPOFF_WINDOW = { start: "9:00 AM",  end: "9:30 AM"  };
const PICKUP_WINDOW  = { start: "12:30 PM", end: "1:00 PM"  };
const NAP_WINDOW     = { start: "1:30 PM",  end: "2:00 PM"  };

// Default categories for the task organizer
const DEFAULT_CATEGORIES = [
    { id: 'health',    name: 'Health & Appointments', icon: '🏥', urgent: true  },
    { id: 'school',    name: 'School & Activities',   icon: '🎒', urgent: true  },
    { id: 'home',      name: 'Home Maintenance',      icon: '🔧', urgent: false },
    { id: 'financial', name: 'Financial',             icon: '💰', urgent: false },
    { id: 'social',    name: 'Social / Family',       icon: '👨‍👩‍👧', urgent: false },
    { id: 'travel',    name: 'Travel & Events',       icon: '✈️',  urgent: false },
    { id: 'parenting', name: 'Parenting / Private',   icon: '🔒', urgent: false },
    { id: 'projects',  name: 'Projects',              icon: '📋', urgent: false },
    { id: 'ideas',     name: 'Ideas / Someday',       icon: '💡', urgent: false },
    { id: 'hurricane', name: 'Hurricane Prep',        icon: '🌀', urgent: false },
];

const DEFAULT_STORES = ['Publix', 'Whole Foods', 'Costco', 'Target'];
```

## Data Models

### Week Data (Schedule tab)
```javascript
{
  week: "Jan 26–30",
  days: [{
    day: "Monday",
    date: "1/26",
    hidden: false,
    notes: "",
    fernando_meetings: [{ time: "9:00 AM", title: "Meeting" }],
    yenny_meetings:    [{ time: "1:00 PM", title: "Meeting" }],
    dropoff: { assigned: "Fernando", conflict: false, reason: "" },
    pickup:  { assigned: "Yenny",    conflict: false, reason: "" },
    nap:     { assigned: "Fernando", conflict: false, reason: "" }
  }]
}
```

### Capture (Mental Dump tab)
```javascript
{
  id:        number,   // Date.now() timestamp
  content:   string,
  category:  string,   // category id (e.g. 'health', 'school')
  type:      "text" | "voice",
  parent:    string,   // parent name
  timestamp: string,   // ISO string
  completed: boolean
}
```

### Grocery Item
```javascript
{
  id:        number,   // Date.now() + index offset
  name:      string,   // capitalized
  store:     string,   // empty string = unassigned
  completed: boolean,
  addedBy:   string,   // parent name
  timestamp: string,   // ISO string
}
```

### Category
```javascript
{
  id:     string,   // kebab-case identifier
  name:   string,
  icon:   string,   // emoji
  urgent: boolean
}
```

## Claude API Usage

All Claude calls use model **`claude-sonnet-4-20250514`** and go through `callClaude()` which posts to the Cloudflare Worker:

| Function | Tokens | Purpose |
|---|---|---|
| `analyzeSchedules()` | 1000 × 2 | Vision: read meeting times from calendar screenshot images |
| `analyzeSchedules()` | 2000 | Assign daycare duties based on parsed schedules |
| `parseGroceryIntent()` | 300 | Determine if a capture is a grocery request and extract items |
| `parseItemsFromText()` | 300 | Extract individual item names from bulk grocery text |

All Claude responses that return JSON must be stripped of markdown fences before parsing:
```javascript
const raw = data.content[0].text.replace(/```json|```/g, '').trim();
```

## State Management

State is managed entirely with React `useState` hooks inside the single `FamilyCoordinator` component. There is no external state library.

State is grouped by concern with inline comments:
- `// ── Shared ────` — tab, parent names, sync status, categories
- `// ── Schedule ──` — uploaded images, analysis state, week data
- `// ── Mental Dump ──` — captures, recording state, input
- `// ── Organized ──` — category expansion, editing state
- `// ── Grocery ──` — grocery list, stores, input

## Data Sync Pattern

`syncWithGoogle(saveWeek, saveDump, saveGroceries, saveCategories, saveStores)`:
- Called with **no arguments** → performs a `GET` (read from Sheets)
- Called with **any defined argument** → performs a `POST` (write to Sheets)
- Uses `mode: 'no-cors'` for writes (no response body is read)
- Auto-polls on a `SYNC_INTERVAL` (5 second) interval via `useEffect`
- `syncStatus` values: `'ready'`, `'syncing'`, `'synced'`, `'error'`, `'setup_needed'`

## Code Conventions

### Naming
- Variables and functions: `camelCase`
- React component: `PascalCase` (`FamilyCoordinator`)
- Tab identifiers: kebab-case strings (`'schedule'`, `'dump'`, `'organized'`, `'grocery'`)
- State setters follow the pattern: `setXxx` matching state variable `xxx`

### Patterns
- Immutable state updates: always spread (`{ ...obj }` / `[...arr]`)
- IDs use `Date.now()` with an offset for arrays (`Date.now() + i`)
- All async operations use `async/await` with `try/catch`
- Grocery item names are capitalized on creation: `name.charAt(0).toUpperCase() + name.slice(1)`
- `guessCategory(text)` uses regex keyword matching to auto-assign categories client-side before any API call

### UI Conventions
- All styling uses Tailwind CSS utility classes (no custom CSS)
- Icons are emojis embedded in category/store data
- Tab badges show pending item counts
- Expandable/collapsible sections use boolean state per item ID

## Development Workflow

### Making Changes

Since the entire app is one file, all edits go directly to `index.html`. There is no build, compile, or bundle step.

1. Edit `index.html`
2. Open the file directly in a browser (or via a local server) to test
3. Commit and push

### Testing

There is no automated test suite. Testing is done manually by opening `index.html` in a browser.

To test Claude integrations, the Cloudflare Worker (`WORKER_URL`) must be reachable.
To test sync, the Google Apps Script must be deployed and `GOOGLE_SCRIPT_URL` must be set.

### Updating the Google Apps Script

The Google Apps Script code is embedded as a comment block near the bottom of `index.html` (around line 960+). When the data schema changes:
1. Copy the script code from the HTML comment
2. Paste into the Google Apps Script editor at script.google.com
3. Deploy as a new version
4. Update `GOOGLE_SCRIPT_URL` in `index.html` if the deployment URL changes

### Bumping the Version

The version number appears in the `<title>` tag:
```html
<title>Family Coordinator v8.4</title>
```

Increment this when making significant changes.

## Key Gotchas

- **CORS**: The Claude API cannot be called directly from the browser. All AI calls must go through `WORKER_URL` (the Cloudflare Worker).
- **Google Sheets write mode**: POST uses `mode: 'no-cors'`, which means no response body can be read. Write errors are silent.
- **No npm / no node_modules**: This project has zero local dependencies. Do not create a `package.json` or attempt to run `npm install`.
- **No bundler**: JSX is compiled in the browser at runtime by Babel Standalone. Do not introduce import/export statements or CommonJS `require()`.
- **Single component**: All application logic lives in the `FamilyCoordinator` function. There are no separate component files.
- **Hardcoded parent names**: "Fernando" and "Yenny" are the defaults in `useState`, but are synced from Google Sheets on load. The child's name "Leo" is hardcoded in schedule analysis prompts.
- **Meeting field names**: The week data uses `fernando_meetings` and `yenny_meetings` as literal field names (not parameterized), even though the parent names are configurable state.
