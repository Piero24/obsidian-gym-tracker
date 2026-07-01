# Gym Workout Tracker — Session Context

## What this is
An Obsidian plugin to track gym workouts with minimal friction. Calendar view + templates + quick data entry. Zero vault clutter (one JSON file).

## Key decisions made

### Table layout (7 columns per exercise)
`rep templ.` | `rep last t.` | **`rep today`** | `kg templ.` | `kg last t.` | **`kg today`** | `rest`

- Only `rep today` and `kg today` are editable
- `rep last t.` / `kg last t.` auto-fetched from most recent past session (computed on the fly, not stored)
- `rep templ.` / `kg templ.` / `rest` from template baseline (only changed manually)
- Set number implied by row position

### Data storage
- ONE file: `.obsidian/plugins/gym-tracker/data.json` via Obsidian's `loadData()`/`saveData()`
- Zero markdown files created in vault

### How "last time" works
- Queries past sessions for same exercise + same set number
- Shows read-only reference
- Template baseline is NEVER auto-updated (avoids pollution from off-days)

### Templates
- Created/edited in Settings tab
- Per-exercise: name, optional note, sets (each with reps, weight, restSeconds)
- Template baseline = "what I usually do" — changes only when user edits the template

## Project files (all created, compiles clean)

```
/workplace/
├── main.ts              # Plugin entry + settings tab
├── main.js              # Built bundle (14KB)
├── types.ts             # TypeScript interfaces
├── manifest.json        # Obsidian plugin manifest
├── styles.css           # All styles
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── utils/
│   └── calendar.ts      # Month grid, date formatting
├── data/
│   └── DataStore.ts     # CRUD + "last time" queries
└── views/
    ├── CalendarView.ts  # Sidebar monthly calendar
    └── WorkoutModal.ts  # Template picker + exercise tables
```

## Build status
- TypeScript: clean (no errors, no unused locals)
- esbuild: produces main.js (14KB)
- Dependencies: obsidian (types only), esbuild, typescript

## What still needs doing
1. Write unit tests for calendar utils and DataStore
2. Init git repo + push to GitHub
3. Manual test in Obsidian vault

## GitHub state
- `gh` CLI NOT available in this environment
- No GITHUB_TOKEN set
- Git is available
- Need to: `git init` → commit → user adds remote and pushes

## Implementation notes
- Uses Obsidian's older imperative settings API (`display()`) with stubs for newer declarative API (`getSettingDefinitions` returns `[]`)
- CalendarView extends `ItemView`, uses `containerEl.children[1]` for content area
- WorkoutModal handles both new sessions (template picker first) and editing existing sessions
- DataStore wraps `loadData`/`saveData`, handles first-run null with defaults merge

## User flow
1. **Setup**: Settings → create templates with exercises + sets
2. **Daily**: Ribbon icon → calendar → "Start Workout" → pick template → form pre-fills "last time" → edit only today columns → "Finish"
3. **Review**: Calendar click on any date → view/edit that session
