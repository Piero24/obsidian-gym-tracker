import { GymTrackerData, GymSettings, WorkoutTemplate, WorkoutSession, LastSetData } from "../types";
import { Plugin, normalizePath } from "obsidian";

const DEFAULT_SETTINGS: GymSettings = {
    weekStartDay: 'monday',
    weightUnit: 'kg',
    storageMode: 'plugin',
    vaultFolder: '.gym-tracker',
    vaultFileName: 'data',
    showInGraph: false,
};

const KG_TO_LBS = 2.20462;

const DEFAULT_DATA: GymTrackerData = {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    templates: [],
    sessions: {},
};

/**
 * Data access layer supporting two storage backends:
 * - 'plugin': Obsidian's loadData/saveData (.obsidian/plugins/.../data.json)
 * - 'vault': Regular vault file (synced via Obsidian Sync / iCloud)
 */
export class DataStore {
    private plugin: Plugin;
    private data: GymTrackerData;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
        this.data = { ...DEFAULT_DATA };
    }

    async load(): Promise<void> {
        // Bootstrap: always read plugin data first to discover storage mode
        const pluginData = await this.plugin.loadData() as Partial<GymTrackerData> | undefined;
        const bootSettings: GymSettings = this.buildSettings(pluginData?.settings);

        // Read from whichever backend the settings point to
        let raw: Partial<GymTrackerData> | undefined;
        let templatesFromSeparateFile: WorkoutTemplate[] | undefined;

        if (bootSettings.storageMode === 'vault') {
            const path = this.getVaultPath(bootSettings);
            if (await this.plugin.app.vault.adapter.exists(path)) {
                const text = await this.plugin.app.vault.adapter.read(path);
                raw = this.parseFile(text, path) ?? undefined;
            }
            
            const templatesPath = this.getTemplatesVaultPath(bootSettings);
            if (await this.plugin.app.vault.adapter.exists(templatesPath)) {
                const text = await this.plugin.app.vault.adapter.read(templatesPath);
                const tRaw = this.parseFile(text, templatesPath);
                if (tRaw && tRaw.templates) {
                    templatesFromSeparateFile = tRaw.templates;
                }
            }
        } else {
            raw = pluginData;
        }

        if (raw) {
            this.data = {
                ...DEFAULT_DATA,
                ...raw,
                settings: this.buildSettings(raw.settings),
                sessions: { ...(raw.sessions || {}) },
            };
        }

        // If templates were loaded from a separate file, override the ones from data.json
        if (templatesFromSeparateFile) {
            this.data.templates = templatesFromSeparateFile;
        }
    }

    // Build settings with backward compat for old fields
    private buildSettings(saved: Partial<GymSettings> | undefined): GymSettings {
        const s: GymSettings = { ...DEFAULT_SETTINGS, ...(saved || {}) };
        // Migrate old vaultDataPath field (backward compat)
        const legacyVaultPath = saved && 'vaultDataPath' in saved
            ? (saved as Record<string, unknown>).vaultDataPath
            : undefined;
        if (typeof legacyVaultPath === 'string' && !saved?.vaultFolder) {
            const parts = legacyVaultPath.split('/');
            const fileName = parts.pop() || 'data';
            const folder = parts.join('/') || '.gym-tracker';
            s.vaultFolder = folder;
            s.vaultFileName = fileName.replace(/\.(json|md)$/, '');
            s.showInGraph = legacyVaultPath.endsWith('.md');
        }
        return s;
    }

    async save(): Promise<void> {
        await this.writeStorage(this.data);
    }

    // ── Storage backend ──

    getVaultPath(settings?: GymSettings): string {
        const s = settings || this.data.settings;
        const ext = s.showInGraph ? 'md' : 'json';
        return normalizePath(`${s.vaultFolder}/${s.vaultFileName}.${ext}`);
    }

    getTemplatesVaultPath(settings?: GymSettings): string {
        const s = settings || this.data.settings;
        const ext = s.showInGraph ? 'md' : 'json';
        return normalizePath(`${s.vaultFolder}/templates.${ext}`);
    }

    private parseFile(text: string, path: string): Partial<GymTrackerData> | null {
        if (path.endsWith('.md')) {
            // Extract JSON from YAML frontmatter
            const match = text.match(/^---\n([\s\S]*?)\n---/);
            if (match) {
                const lines = match[1].split('\n');
                for (const line of lines) {
                    const m = line.match(/^gym_data:\s*(.+)$/);
                    if (m) return JSON.parse(m[1]) as Partial<GymTrackerData>;
                }
            }
            return null;
        }
        return JSON.parse(text) as Partial<GymTrackerData>;
    }

    private buildFile(data: GymTrackerData): string {
        const json = JSON.stringify(data, null, 2);
        if (data.settings.showInGraph) {
            return `---\ngym_data: ${JSON.stringify(json)}\n---\n`;
        }
        return json;
    }

    private async writeStorage(data: GymTrackerData): Promise<void> {
        const mode = data.settings.storageMode;
        if (mode === 'vault') {
            try {
                const vault = this.plugin.app.vault;
                const path = this.getVaultPath(data.settings);
                const dir = path.split('/').slice(0, -1).join('/');

                // Ensure folder hierarchy exists
                if (dir) {
                    const parts = dir.split('/');
                    let current = '';
                    for (const part of parts) {
                        current = current ? `${current}/${part}` : part;
                        if (!(await vault.adapter.exists(current))) {
                            await vault.adapter.mkdir(current);
                        }
                    }
                }

                // Write templates to separate file
                const templatesPath = this.getTemplatesVaultPath(data.settings);
                const templatesData = { ...data, sessions: {} };
                const templatesContent = this.buildFile(templatesData);
                await vault.adapter.write(templatesPath, templatesContent);

                // Write main data file (without templates)
                const mainData = { ...data, templates: [] };
                const mainContent = this.buildFile(mainData);
                await vault.adapter.write(path, mainContent);
                return;
            } catch (err) {
                // Vault write failed — fall back to plugin storage so data is never lost
                console.warn('Gym Tracker: vault write failed, falling back to plugin storage:', err);
                await this.plugin.saveData(data);
                return;
            }
        }
        // plugin mode
        await this.plugin.saveData(data);
    }

    getData(): GymTrackerData {
        return this.data;
    }

    // ── Template CRUD ──

    getTemplates(): WorkoutTemplate[] {
        return this.data.templates;
    }

    getTemplate(id: string): WorkoutTemplate | undefined {
        return this.data.templates.find(t => t.id === id);
    }

    async saveTemplate(template: WorkoutTemplate): Promise<void> {
        const idx = this.data.templates.findIndex(t => t.id === template.id);
        if (idx >= 0) {
            this.data.templates[idx] = template;
        } else {
            this.data.templates.push(template);
        }
        await this.save();
    }

    async deleteTemplate(id: string): Promise<void> {
        this.data.templates = this.data.templates.filter(t => t.id !== id);
        await this.save();
    }

    // ── Session CRUD ──

    getSession(date: string): WorkoutSession | undefined {
        return this.data.sessions[date];
    }

    getAllSessions(): WorkoutSession[] {
        return Object.values(this.data.sessions).sort(
            (a, b) => b.date.localeCompare(a.date)
        );
    }

    async saveSession(session: WorkoutSession): Promise<void> {
        this.data.sessions[session.date] = session;
        await this.save();
    }

    async deleteSession(date: string): Promise<void> {
        delete this.data.sessions[date];
        await this.save();
    }

    // ── "Last time" queries ──

    /**
     * For a given templateExerciseId and setNumber, find the most recent
     * session (before `beforeDate`) where this exercise+set was logged.
     * Returns { reps, weight } or null if never done before.
     */
    getLastSetData(
        templateExerciseId: string,
        setNumber: number,
        beforeDate?: string
    ): LastSetData | null {
        const sessions = Object.values(this.data.sessions)
            .filter(s => !beforeDate || s.date < beforeDate)
            .sort((a, b) => b.date.localeCompare(a.date));

        for (const session of sessions) {
            const ex = session.exercises.find(
                e => e.templateExerciseId === templateExerciseId
            );
            if (ex) {
                const set = ex.sets.find(s => s.setNumber === setNumber);
                if (set) {
                    return { reps: set.reps, weight: set.weight };
                }
            }
        }

        return null;
    }

    /**
     * Get a map of setNumber → LastSetData for all sets in a given exercise.
     */
    getLastSetDataForExercise(
        templateExerciseId: string,
        beforeDate?: string
    ): Map<number, LastSetData> {
        const result = new Map<number, LastSetData>();
        const sessions = Object.values(this.data.sessions)
            .filter(s => !beforeDate || s.date < beforeDate)
            .sort((a, b) => b.date.localeCompare(a.date));

        for (const session of sessions) {
            const ex = session.exercises.find(
                e => e.templateExerciseId === templateExerciseId
            );
            if (ex) {
                for (const set of ex.sets) {
                    if (!result.has(set.setNumber)) {
                        result.set(set.setNumber, {
                            reps: set.reps,
                            weight: set.weight,
                        });
                    }
                }
                // Once we found the most recent session with this exercise,
                // we have all sets from it. Stop looking further back.
                break;
            }
        }

        return result;
    }

    // ── Settings ──

    getSettings(): GymSettings {
        return this.data.settings;
    }

    async saveSettings(settings: GymSettings): Promise<void> {
        const oldMode = this.data.settings.storageMode;
        const newMode = settings.storageMode;
        const oldUnit = this.data.settings.weightUnit;
        const newUnit = settings.weightUnit;

        if (oldUnit !== newUnit) {
            this.convertWeights(oldUnit, newUnit);
        }

        // If storage mode changed, migrate data from old backend to new
        if (oldMode !== newMode) {
            const tempSettings = { ...settings };
            const prev = this.data.settings;
            this.data.settings = tempSettings;
            await this.writeStorage(this.data);
            this.data.settings = prev;
        }

        this.data.settings = settings;
        await this.save();
    }

    private convertWeights(from: 'kg' | 'lbs', to: 'kg' | 'lbs'): void {
        const factor = to === 'lbs' ? KG_TO_LBS : (1 / KG_TO_LBS);

        // Convert template exercise sets
        for (const tpl of this.data.templates) {
            for (const ex of tpl.exercises) {
                for (const set of ex.sets) {
                    set.weight = Math.round(set.weight * factor * 10) / 10;
                }
            }
        }

        // Convert session exercise sets
        for (const session of Object.values(this.data.sessions)) {
            for (const ex of session.exercises) {
                for (const set of ex.sets) {
                    set.weight = Math.round(set.weight * factor * 10) / 10;
                }
            }
        }
    }

    async clearAllData(): Promise<void> {
        this.data.templates = [];
        this.data.sessions = {};
        await this.save();
    }

    // ── Utility ──

    generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }
}
