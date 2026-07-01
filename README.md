# Gym Workout Tracker, Obsidian Plugin

Track your gym workouts with minimal friction. Calendar view, exercise templates with autocomplete (1,300+ exercises with GIFs), auto-save, and zero vault clutter.

## Features

- **📅 Calendar View**: Monthly calendar to navigate, review, and start workouts. Click any date to log or edit a session. Workout days are marked with an indicator dot.
- **🏋️ Exercise Database**: 1,300+ exercises from the [exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset). Autocomplete search with thumbnail previews, GIF demonstrations, and muscle/equipment tags.
- **📋 Templates**: Create reusable workout templates (e.g. "Push Day", "Leg Day") with per-exercise sets, reps, weight, and rest timers. Collapsible cards keep the UI clean.
- **🔄 "Last Time" Auto-Fill**: Each set pre-fills with your previous session's numbers so you know what to beat.
- **💾 Auto-Save**: Every edit is saved immediately. Close the tab anytime — nothing is lost.
- **⚖️ kg / lbs**: Switch units in settings. All existing data converts automatically.
- **🔒 Privacy-First**: All data in one file. Choose between plugin storage or a vault folder (syncs via Obsidian Sync / iCloud). Folder visibility is yours to control.
- **📱 Responsive**: Tables scroll horizontally on narrow screens. Works on mobile.

## Installation

### Community Plugins (recommended)

Once approved, search "Gym Workout Tracker" in Obsidian's Community Plugins browser.

### BRAT (Beta)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. Add `https://github.com/Piero24/obsidian-gym-tracker`
3. Enable the plugin in Community Plugins

### Manual

```bash
cd /path/to/vault/.obsidian/plugins
git clone https://github.com/Piero24/obsidian-gym-tracker.git gym-workout-tracker
cd gym-workout-tracker
npm install && npm run build
```

Then enable "Gym Workout Tracker" in Settings → Community Plugins.

## Usage

1. Click the **dumbbell icon** in the ribbon, or run "Open gym calendar" from the command palette
2. **Create a template** in Settings → Gym Workout Tracker. Type an exercise name, autocomplete suggests matching exercises from the database with preview images
3. Click a **date** in the calendar to start a workout
4. **Select a template** → all exercises, sets, and last-time data are pre-filled
5. **Edit reps and weight** everything auto-saves. Click **Done** when finished
6. **Delete a workout** from the workout page, or **clear all data** from General settings

## Settings

### General
- **Week starts on**: Monday or Sunday (affects calendar layout)
- **Weight unit**: kg or lbs (converts all existing data automatically)
- **Storage location**: Plugin data (default, not synced) or Vault folder (syncs via Obsidian Sync / iCloud)
- **Vault folder**: Folder name. Prefix with `.` to hide from file explorer (e.g. `.gym-tracker`)
- **File name**: Data file name without extension
- **Show in graph**: Stores as `.md` with frontmatter so the file appears in Obsidian's graph view
- **Clear all data**: Deletes all templates and workout sessions

### Templates
- Collapsible template and exercise cards
- Exercise name autocomplete with 1,300+ exercises
- Custom exercises supported (type any name not in the database)
- Per-exercise notes, configurable sets/reps/weight/rest

## Development

```bash
npm install
npm run dev     # Watch mode — rebuilds on file changes
npm run build   # Production build (type-check + bundle)
```

### File Structure

```
├── main.ts                  # Plugin entry point, settings tab
├── types.ts                 # TypeScript interfaces
├── styles.css               # All plugin styles
├── manifest.json            # Obsidian plugin manifest
├── data/
│   ├── DataStore.ts         # Data layer (plugin + vault storage)
│   ├── exerciseDataset.ts   # Exercise search & URL helpers
│   └── exercises.json       # 1,300+ exercise records
├── views/
│   ├── CalendarView.ts      # Monthly calendar view
│   └── WorkoutView.ts       # Workout form view
└── utils/
    └── calendar.ts          # Calendar grid & date utilities
```

### Storage Architecture

The plugin supports two storage backends with automatic migration:

- **Plugin data** (`storageMode: 'plugin'`): Data stored in `.obsidian/plugins/gym-tracker/data.json`. Not synced.
- **Vault folder** (`storageMode: 'vault'`): Data stored at a configurable vault path (e.g. `.gym-tracker/data.json`). Synced via Obsidian Sync / iCloud / Git.

On mode switch, data is automatically migrated. If a vault write fails (e.g. folder deleted), the plugin falls back to plugin storage so data is never lost.

### Releasing

Push to `main` → GitHub Actions builds and creates a release with `main.js`, `manifest.json`, and `styles.css`. Bump `version` in `manifest.json` before pushing.

## Credits

### Exercise Dataset

This plugin includes exercise data, thumbnail images, and GIF demonstrations from the **[exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset)** by [Hasan Eylül Drm](https://github.com/hasaneyldrm). The dataset contains 1,300+ exercises with detailed metadata including muscle groups, equipment, and instructions in multiple languages.

All exercise images and GIFs are hosted on the dataset's GitHub repository and loaded at runtime — they are not bundled with the plugin. Full rights and attribution for the exercise data and media belong to the original dataset authors.

### Built With

- [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api)

## License

MIT
