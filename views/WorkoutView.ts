import { ItemView, WorkspaceLeaf, ViewStateResult } from "obsidian";
import { DataStore } from "../data/DataStore";
import { confirmAction } from "../utils/ConfirmModal";
import {
    WorkoutTemplate,
    TemplateExercise,
    WorkoutSession,
    SessionExercise,
    SessionSet,
} from "../types";
import { CALENDAR_VIEW_TYPE, CalendarView } from "./CalendarView";

export const WORKOUT_VIEW_TYPE = "gym-tracker-workout";

export class WorkoutView extends ItemView {
    private store: DataStore;
    private date: string = "";

    // Form state
    private template: WorkoutTemplate | null = null;
    private sessionId: string = "";
    private sessionNote: string = "";
    private exerciseNotes: Map<string, string> = new Map();
    // exerciseId → (setNumber → { reps, weight })
    private todayData: Map<string, Map<number, { reps: number; weight: number }>> = new Map();
    private isDeleted: boolean = false;

    constructor(leaf: WorkspaceLeaf, store: DataStore) {
        super(leaf);
        this.store = store;
        this.navigation = false;
    }

    getViewType(): string {
        return WORKOUT_VIEW_TYPE;
    }

    getDisplayText(): string {
        if (this.date) {
            return `Workout — ${this.date}`;
        }
        return "Workout";
    }

    getIcon(): string {
        return "dumbbell";
    }

    getState(): Record<string, unknown> {
        return { date: this.date };
    }

    async setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> {
        this.date = (state.date as string) ?? "";
        result.history = false;
        await this.render();
    }

    async onOpen(): Promise<void> {
        // setState() is called after onOpen() with the date from ViewState
    }

    // ── Render ──

    private async render(): Promise<void> {
        const container = this.contentEl;
        container.empty();
        container.addClass("gym-workout-modal");

        if (!this.date) return;

        // Title
        container.createEl("h2", {
            text: `Workout — ${this.date}`,
            cls: "gym-workout-title",
        });

        const existingSession = this.store.getSession(this.date);

        if (existingSession) {
            // Editing existing session — load data into form state
            this.loadExistingSession(existingSession);
            this.renderForm(container);
        } else {
            // New session — show template picker first
            this.renderTemplatePicker(container);
        }
    }

    // ── Template picker (new session) ──

    private renderTemplatePicker(container: HTMLElement): void {
        const templates = this.store.getTemplates();
        if (templates.length === 0) {
            container.createEl("p", {
                text: "No templates yet. Create one in Settings → Gym Workout Tracker.",
                cls: "gym-workout-empty",
            });
            return;
        }

        const pickerDiv = container.createDiv("gym-template-picker");

        pickerDiv.createEl("label", { text: "Select template:" });
        const select = pickerDiv.createEl("select");
        select.createEl("option", { text: "-- choose --", value: "" });

        for (const tpl of templates) {
            select.createEl("option", { text: tpl.name, value: tpl.id });
        }

        const loadBtn = pickerDiv.createEl("button", {
            text: "Load Template",
            cls: "gym-load-template-btn",
        });

        loadBtn.onclick = async () => {
            const id = select.value;
            if (!id) return;
            const tpl = this.store.getTemplate(id);
            if (tpl) {
                this.template = tpl;
                this.sessionId = this.store.generateId();
                // Initialize today data from template defaults + last time
                this.initTodayData(tpl);
                // Auto-save initial draft
                await this.autoSave();
                container.empty();
                this.renderForm(container);
            }
        };
    }

    // ── Load existing session into form state ──

    private loadExistingSession(session: WorkoutSession): void {
        this.sessionId = session.id;
        const tpl = this.store.getTemplate(session.templateId);
        if (tpl) {
            this.template = tpl;
        } else {
            // Template was deleted — build ghost from session data
            this.template = {
                id: session.templateId,
                name: session.templateName || '(Deleted)',
                exercises: session.exercises.map(ex => ({
                    id: ex.templateExerciseId,
                    name: ex.name,
                    note: '',
                    sets: ex.sets.map(s => ({
                        setNumber: s.setNumber,
                        reps: s.reps,
                        weight: s.weight,
                        restSeconds: 90,
                    })),
                })),
            };
        }
        this.sessionNote = session.note || "";

        for (const ex of session.exercises) {
            const setMap = new Map<number, { reps: number; weight: number }>();
            for (const set of ex.sets) {
                setMap.set(set.setNumber, { reps: set.reps, weight: set.weight });
            }
            this.todayData.set(ex.templateExerciseId, setMap);
            if (ex.note) {
                this.exerciseNotes.set(ex.templateExerciseId, ex.note);
            }
        }
    }

    // ── Initialize today data from template (new session) ──

    private initTodayData(tpl: WorkoutTemplate): void {
        for (const ex of tpl.exercises) {
            const setMap = new Map<number, { reps: number; weight: number }>();
            const lastData = this.store.getLastSetDataForExercise(ex.id, this.date);

            for (const tSet of ex.sets) {
                // Pre-fill with last time if available, otherwise template defaults
                const last = lastData.get(tSet.setNumber);
                setMap.set(tSet.setNumber, {
                    reps: last ? last.reps : tSet.reps,
                    weight: last ? last.weight : tSet.weight,
                });
            }

            this.todayData.set(ex.id, setMap);
        }
    }

    // ── Main form ──

    private renderForm(container: HTMLElement): void {
        if (!this.template) return;

        // Title (re-added in case renderForm is called via template picker which cleared it)
        if (!container.querySelector(".gym-workout-title")) {
            const title = container.createEl("h2", {
                text: `Workout — ${this.date}`,
                cls: "gym-workout-title",
            });
            container.insertBefore(title, container.firstChild);
        }

        // Session note
        const noteSection = container.createDiv("gym-session-note");
        noteSection.createEl("label", { text: "📝 Session note:" });
        const noteInput = noteSection.createEl("textarea", {
            cls: "gym-session-note-input",
            attr: { rows: "2", placeholder: "How are you feeling today?" },
        });
        noteInput.value = this.sessionNote;
        noteInput.onchange = () => {
            this.sessionNote = noteInput.value;
            void this.autoSave();
        };

        // Exercises
        for (const tplEx of this.template.exercises) {
            this.renderExerciseTable(container, tplEx);
        }

        // Buttons
        const btnDiv = container.createDiv("gym-save-btn-row");

        const closeBtn = btnDiv.createEl("button", {
            text: "✅ Done",
            cls: "gym-save-btn",
        });
        closeBtn.onclick = () => this.leaf.detach();

        // Delete button (only for existing sessions)
        const existingSession = this.store.getSession(this.date);
        if (existingSession) {
            const deleteBtn = btnDiv.createEl("button", {
                text: "🗑️ Delete",
                cls: "gym-delete-btn",
            });
            deleteBtn.onclick = async () => {
                if (await confirmAction(this.app, "Delete this workout? This cannot be undone.")) {
                    this.isDeleted = true;
                    await this.store.deleteSession(this.date);
                    const calLeaves = this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE);
                    for (const leaf of calLeaves) {
                        (leaf.view as CalendarView).refresh();
                    }
                    this.leaf.detach();
                }
            };
        }
    }

    // ── Render one exercise's 7-column table ──

    private renderExerciseTable(container: HTMLElement, tplEx: TemplateExercise): void {
        const exDiv = container.createDiv("gym-exercise-block");

        // Exercise header: GIF left, info right
        const headerRow = exDiv.createDiv("gym-exercise-header");

        // GIF preview (always visible, on the left)
        if (tplEx.gifUrl) {
            const gifImg = headerRow.createEl("img", {
                cls: "gym-exercise-gif",
                attr: { src: tplEx.gifUrl, loading: "lazy" },
            });
            gifImg.onerror = () => {
                gifImg.addClass("gym-hidden");
            };
        }

        // Info column (right side)
        const infoCol = headerRow.createDiv("gym-exercise-header-info");

        infoCol.createEl("h3", { text: `🏋️ ${tplEx.name}`, cls: "gym-exercise-name" });

        // Dataset tags
        if (tplEx.category || tplEx.equipment || tplEx.target) {
            const tagsDiv = infoCol.createDiv("gym-exercise-tags");
            if (tplEx.category) {
                tagsDiv.createSpan({ text: tplEx.category, cls: "gym-tag gym-tag-category" });
            }
            if (tplEx.equipment) {
                tagsDiv.createSpan({ text: tplEx.equipment, cls: "gym-tag gym-tag-equipment" });
            }
            if (tplEx.target) {
                tagsDiv.createSpan({ text: tplEx.target, cls: "gym-tag gym-tag-target" });
            }
            if (tplEx.muscleGroup) {
                tagsDiv.createSpan({ text: tplEx.muscleGroup, cls: "gym-tag gym-tag-muscle" });
            }
        }

        // Exercise note
        const exNoteDiv = infoCol.createDiv("gym-exercise-note");
        exNoteDiv.createEl("label", { text: "📝 Note:" });
        const exNoteInput = exNoteDiv.createEl("input", {
            cls: "gym-exercise-note-input",
            attr: { placeholder: "e.g. warm-up with empty bar" },
        });
        exNoteInput.value = this.exerciseNotes.get(tplEx.id) || "";
        exNoteInput.onchange = () => {
            this.exerciseNotes.set(tplEx.id, exNoteInput.value);
            void this.autoSave();
        };

        // Table (scrollable on narrow screens)
        const tableWrapper = exDiv.createDiv("gym-exercise-table-wrapper");
        const table = tableWrapper.createEl("table", "gym-exercise-table");
        this.renderTableHeader(table);
        this.renderTableBody(table, tplEx);
    }

    private renderTableHeader(table: HTMLElement): void {
        const thead = table.createEl("thead");
        const tr = thead.createEl("tr");
        const w = this.store.getSettings().weightUnit === 'lbs' ? 'Lbs' : 'Kg';
        const headers = [
            "Set", "Reps (tpl)", "Reps (last)", "Reps",
            `${w} (tpl)`, `${w} (last)`, w,
            "Rest",
        ];
        for (const h of headers) {
            tr.createEl("th", { text: h });
        }
    }

    private renderTableBody(table: HTMLElement, tplEx: TemplateExercise): void {
        const tbody = table.createEl("tbody");
        const setMap = this.todayData.get(tplEx.id) || new Map<number, { reps: number; weight: number }>();
        const lastData = this.store.getLastSetDataForExercise(tplEx.id, this.date);

        for (const tSet of tplEx.sets) {
            const tr = tbody.createEl("tr");
            const sn = tSet.setNumber;
            const last: { reps: number; weight: number } | undefined = lastData.get(sn);
            const setEntry: { reps: number; weight: number } | undefined = setMap.get(sn);
            const today: { reps: number; weight: number } = setEntry ?? { reps: tSet.reps, weight: tSet.weight };

            // Set number
            tr.createEl("td", {
                text: String(sn),
                cls: "gym-cell-set-num",
            });

            // rep templ. (read-only)
            tr.createEl("td", {
                text: String(tSet.reps),
                cls: "gym-cell-template",
            });

            // rep last t. (read-only)
            tr.createEl("td", {
                text: last ? String(last.reps) : "-",
                cls: "gym-cell-last",
            });

            // rep today (editable)
            const repTd = tr.createEl("td", "gym-cell-today");
            const repInput = repTd.createEl("input", {
                cls: "gym-input-num",
                attr: { type: "number", min: "0", max: "999" },
            });
            repInput.value = String(today.reps);
            repInput.onchange = () => this.updateTodayData(
                tplEx.id, sn, Number(repInput.value), today.weight
            );

            // kg templ. (read-only)
            tr.createEl("td", {
                text: String(tSet.weight),
                cls: "gym-cell-template",
            });

            // kg last t. (read-only)
            tr.createEl("td", {
                text: last ? String(last.weight) : "-",
                cls: "gym-cell-last",
            });

            // kg today (editable)
            const kgTd = tr.createEl("td", "gym-cell-today");
            const kgInput = kgTd.createEl("input", {
                cls: "gym-input-num",
                attr: { type: "number", min: "0", max: "9999", step: "0.5" },
            });
            kgInput.value = String(today.weight);
            kgInput.onchange = () => this.updateTodayData(
                tplEx.id, sn, today.reps, Number(kgInput.value)
            );

            // rest (read-only)
            tr.createEl("td", {
                text: this.formatRest(tSet.restSeconds),
                cls: "gym-cell-template",
            });
        }
    }

    private updateTodayData(
        exerciseId: string,
        setNumber: number,
        reps: number,
        weight: number
    ): void {
        let setMap = this.todayData.get(exerciseId);
        if (!setMap) {
            setMap = new Map<number, { reps: number; weight: number }>();
            this.todayData.set(exerciseId, setMap);
        }
        setMap.set(setNumber, { reps, weight });
        void this.autoSave();
    }

    // ── Auto-save ──

    private async autoSave(): Promise<void> {
        if (!this.template || this.isDeleted) return;

        const exercises: SessionExercise[] = this.template.exercises.map(tplEx => {
            const setMap: Map<number, { reps: number; weight: number }> = this.todayData.get(tplEx.id) || new Map<number, { reps: number; weight: number }>();
            const sets: SessionSet[] = tplEx.sets.map(tSet => {
                const todayEntry: { reps: number; weight: number } | undefined = setMap.get(tSet.setNumber);
                return {
                    setNumber: tSet.setNumber,
                    reps: todayEntry?.reps ?? tSet.reps,
                    weight: todayEntry?.weight ?? tSet.weight,
                };
            });

            return {
                templateExerciseId: tplEx.id,
                name: tplEx.name,
                note: this.exerciseNotes.get(tplEx.id) || "",
                sets,
            };
        });

        const session: WorkoutSession = {
            id: this.sessionId,
            date: this.date,
            templateId: this.template.id,
            templateName: this.template.name,
            note: this.sessionNote,
            exercises,
            completedAt: new Date().toISOString(),
        };

        await this.store.saveSession(session);

        // Refresh calendar views
        const calLeaves = this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE);
        for (const leaf of calLeaves) {
            (leaf.view as CalendarView).refresh();
        }
    }

    async onClose(): Promise<void> {
        // Final save on close in case there are unsaved changes
        await this.autoSave();
    }

    // ── Helpers ──

    private formatRest(seconds: number): string {
        if (seconds >= 60) {
            const m = Math.floor(seconds / 60);
            const s = seconds % 60;
            return s > 0 ? `${m}m${s}s` : `${m}m`;
        }
        return `${seconds}s`;
    }
}
