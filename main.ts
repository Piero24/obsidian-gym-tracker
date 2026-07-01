import { App, Plugin, PluginSettingTab, Setting, SettingDefinitionItem, SettingGroup, WorkspaceLeaf } from "obsidian";
import { confirmAction } from "./utils/ConfirmModal";
import { DataStore } from "./data/DataStore";
import { CalendarView, CALENDAR_VIEW_TYPE } from "./views/CalendarView";
import { WorkoutView, WORKOUT_VIEW_TYPE } from "./views/WorkoutView";
import { WorkoutTemplate, TemplateExercise } from "./types";
import { searchExercises, gifUrl, imageUrl } from "./data/exerciseDataset";
import { todayStr } from "./utils/calendar";

export default class GymTrackerPlugin extends Plugin {
    store!: DataStore;

    async onload(): Promise<void> {
        this.store = new DataStore(this);
        await this.store.load();

        // Register custom calendar view
        this.registerView(
            CALENDAR_VIEW_TYPE,
            (leaf: WorkspaceLeaf) => {
                const view = new CalendarView(
                    leaf,
                    this.store,
                    (date: string) => { void this.openWorkoutView(date); },
                    () => { void this.openWorkoutView(todayStr()); }
                );
                return view;
            }
        );

        // Register workout view
        this.registerView(
            WORKOUT_VIEW_TYPE,
            (leaf: WorkspaceLeaf) => new WorkoutView(leaf, this.store)
        );

        // Ribbon icon
        this.addRibbonIcon("dumbbell", "Open Gym Calendar", () => {
            void this.activateCalendarView();
        });

        // Commands
        this.addCommand({
            id: "open-gym-calendar",
            name: "Open gym calendar",
            callback: () => { void this.activateCalendarView(); },
        });

        this.addCommand({
            id: "start-workout",
            name: "Start today's workout",
            callback: () => { void this.openWorkoutView(todayStr()); },
        });

        // Settings tab
        this.addSettingTab(new GymTrackerSettingTab(this.app, this));
    }

    onunload(): void {
        // Obsidian handles view cleanup
    }

    // ── View management ──

    async activateCalendarView(): Promise<void> {
        const { workspace } = this.app;

        let leaf = workspace.getLeavesOfType(CALENDAR_VIEW_TYPE)[0];
        if (!leaf) {
            const mainLeaf = workspace.getLeaf(false);
            if (mainLeaf) {
                await mainLeaf.setViewState({
                    type: CALENDAR_VIEW_TYPE,
                    active: true,
                });
                leaf = mainLeaf;
            }
        }

        if (leaf) {
            await workspace.revealLeaf(leaf);
            const view = leaf.view as CalendarView;
            view.refresh();
        }
    }

    // ── Workout view ──

    async openWorkoutView(date: string): Promise<void> {
        const { workspace } = this.app;

        let leaf = workspace.getLeavesOfType(WORKOUT_VIEW_TYPE)[0];
        if (!leaf) {
            leaf = workspace.getLeaf(true);
        }
        await leaf.setViewState({
            type: WORKOUT_VIEW_TYPE,
            state: { date },
            active: true,
        });
        await workspace.revealLeaf(leaf);
    }
}

// ═══════════════════════════════════════════════════
// Settings Tab — template management
// ═══════════════════════════════════════════════════

let activeDragId: string | null = null;


class GymTrackerSettingTab extends PluginSettingTab {
    plugin: GymTrackerPlugin;

    constructor(app: App, plugin: GymTrackerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    refreshTab(): void {
        const self = this as unknown as Record<string, unknown>;
        if (typeof self.update === "function") {
            (self.update as () => void)();
        } else {
            const selfDisplay = this as unknown as { display: () => void };
            selfDisplay.display();
        }
    }

    getSettingDefinitions(): SettingDefinitionItem[] {
        return [
            // Week start day
            {
                name: "Week starts on",
                desc: "Calendar week start day",
                render: (setting: Setting) => {
                    const settings = this.plugin.store.getSettings();
                    setting.addDropdown(dropdown => {
                        dropdown
                            .addOption('monday', 'Monday')
                            .addOption('sunday', 'Sunday')
                            .setValue(settings.weekStartDay)
                            .onChange(async (value: string) => {
                                settings.weekStartDay = value as 'monday' | 'sunday';
                                await this.plugin.store.saveSettings(settings);
                            });
                    });
                },
            },

            // Weight unit
            {
                name: "Weight unit",
                desc: "Switching automatically converts all existing weight data",
                render: (setting: Setting) => {
                    const settings = this.plugin.store.getSettings();
                    setting.addDropdown(dropdown => {
                        dropdown
                            .addOption('kg', 'Kilograms (kg)')
                            .addOption('lbs', 'Pounds (lbs)')
                            .setValue(settings.weightUnit)
                            .onChange(async (value: string) => {
                                settings.weightUnit = value as 'kg' | 'lbs';
                                await this.plugin.store.saveSettings(settings);
                                this.refreshTab(); // refresh to update labels
                            });
                    });
                },
            },

            // Storage mode
            {
                name: "Storage location",
                desc: "Plugin data is not synced. Vault folder syncs via Obsidian Sync / iCloud.",
                render: (setting: Setting) => {
                    const settings = this.plugin.store.getSettings();
                    setting.addDropdown(dropdown => {
                        dropdown
                            .addOption('plugin', 'Plugin data')
                            .addOption('vault', 'Vault folder')
                            .setValue(settings.storageMode)
                            .onChange(async (value: string) => {
                                settings.storageMode = value as 'plugin' | 'vault';
                                await this.plugin.store.saveSettings(settings);
                                this.refreshTab();
                            });
                    });
                },
            },

            // Vault folder
            {
                name: "Vault folder",
                desc: "Folder in your vault. Prefix with . to hide from file explorer (e.g. .gym-tracker)",
                render: (setting: Setting) => {
                    const settings = this.plugin.store.getSettings();
                    setting.addText(text => {
                        text
                            .setValue(settings.vaultFolder)
                            .setPlaceholder('.gym-tracker')
                            .onChange(async (value: string) => {
                                settings.vaultFolder = value || '.gym-tracker';
                                await this.plugin.store.saveSettings(settings);
                            });
                    });
                },
            },

            // File name
            {
                name: "File name",
                desc: "File name without extension. e.g. data",
                render: (setting: Setting) => {
                    const settings = this.plugin.store.getSettings();
                    setting.addText(text => {
                        text
                            .setValue(settings.vaultFileName)
                            .setPlaceholder('data')
                            .onChange(async (value: string) => {
                                settings.vaultFileName = value || 'data';
                                await this.plugin.store.saveSettings(settings);
                            });
                    });
                },
            },

            // Show in graph
            {
                name: "Show in graph",
                desc: "Stores as .md with frontmatter so file appears in graph view",
                render: (setting: Setting) => {
                    const settings = this.plugin.store.getSettings();
                    setting.addToggle(toggle => {
                        toggle
                            .setValue(settings.showInGraph)
                            .onChange(async (value: boolean) => {
                                settings.showInGraph = value;
                                await this.plugin.store.saveSettings(settings);
                            });
                    });
                },
            },

            // Clear all data
            {
                name: "Clear all data",
                desc: "Delete all templates and workout sessions. This cannot be undone.",
                render: (setting: Setting) => {
                    setting.addButton(btn => {
                        btn.setButtonText("Clear All Data");
                        const destBtn = btn as unknown as { setDestructive?: () => void, setWarning: () => void };
                        if (typeof destBtn.setDestructive === "function") {
                            destBtn.setDestructive();
                        } else {
                            destBtn.setWarning();
                        }
                        btn.onClick(async () => {
                                if (await confirmAction(this.app, "Delete ALL templates and workout data? This cannot be undone.")) {
                                    await this.plugin.store.clearAllData();
                                    this.refreshTab();
                                }
                            });
                    });
                },
            },

            // ═══ Templates ═══
            {
                type: 'group' as const,
                heading: "🏋️ Templates",
                cls: "gym-settings",
            },

            // Templates section (imperative render)
            {
                name: "",
                render: (_setting: Setting, group: SettingGroup) => {
                    const container = (group as unknown as { listEl: HTMLElement }).listEl;

                    const templates = this.plugin.store.getTemplates();

                    if (templates.length === 0) {
                        container.createEl("p", {
                            text: "No templates yet. Create your first workout template below.",
                            cls: "setting-item-description",
                        });
                    }

                    // Render each template
                    for (const tpl of templates) {
                        this.renderTemplateCard(container, tpl);
                    }

                    // "Add Template" button
                    const addDiv = container.createDiv("gym-settings-add");
                    const addBtn = addDiv.createEl("button", {
                        text: "+ New Template",
                        cls: "gym-settings-add-btn",
                    });
                    addBtn.onclick = async () => {
                        const tpl: WorkoutTemplate = {
                            id: this.plugin.store.generateId(),
                            name: "New Template",
                            exercises: [],
                        };
                        await this.plugin.store.saveTemplate(tpl);
                        this.refreshTab();
                    };
                },
            },
        ];
    }

    // Fallback for Obsidian < 1.13.0 (before getSettingDefinitions was introduced)
    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass("gym-settings");

        const settings = this.plugin.store.getSettings();

        // Week start day
        new Setting(containerEl)
            .setName("Week starts on")
            .setDesc("Calendar week start day")
            .addDropdown(dropdown => {
                dropdown
                    .addOption('monday', 'Monday')
                    .addOption('sunday', 'Sunday')
                    .setValue(settings.weekStartDay)
                    .onChange(async (value: string) => {
                        settings.weekStartDay = value as 'monday' | 'sunday';
                        await this.plugin.store.saveSettings(settings);
                    });
            });

        // Weight unit
        new Setting(containerEl)
            .setName("Weight unit")
            .setDesc("Switching automatically converts all existing weight data")
            .addDropdown(dropdown => {
                dropdown
                    .addOption('kg', 'Kilograms (kg)')
                    .addOption('lbs', 'Pounds (lbs)')
                    .setValue(settings.weightUnit)
                    .onChange(async (value: string) => {
                        settings.weightUnit = value as 'kg' | 'lbs';
                        await this.plugin.store.saveSettings(settings);
                        this.refreshTab();
                    });
            });

        // Storage mode
        new Setting(containerEl)
            .setName("Storage location")
            .setDesc("Plugin data is not synced. Vault folder syncs via Obsidian Sync / iCloud.")
            .addDropdown(dropdown => {
                dropdown
                    .addOption('plugin', 'Plugin data')
                    .addOption('vault', 'Vault folder')
                    .setValue(settings.storageMode)
                    .onChange(async (value: string) => {
                        settings.storageMode = value as 'plugin' | 'vault';
                        await this.plugin.store.saveSettings(settings);
                        this.refreshTab();
                    });
            });

        // Folder name
        new Setting(containerEl)
            .setName("Vault folder")
            .setDesc("Folder in your vault. Prefix with . to hide from file explorer (e.g. .gym-tracker)")
            .addText(text => {
                text
                    .setValue(settings.vaultFolder)
                    .setPlaceholder('.gym-tracker')
                    .onChange(async (value: string) => {
                        settings.vaultFolder = value || '.gym-tracker';
                        await this.plugin.store.saveSettings(settings);
                    });
            });

        // File name
        new Setting(containerEl)
            .setName("File name")
            .setDesc("File name without extension. e.g. data")
            .addText(text => {
                text
                    .setValue(settings.vaultFileName)
                    .setPlaceholder('data')
                    .onChange(async (value: string) => {
                        settings.vaultFileName = value || 'data';
                        await this.plugin.store.saveSettings(settings);
                    });
            });

        // Show in graph
        new Setting(containerEl)
            .setName("Show in graph")
            .setDesc("Stores as .md with frontmatter so file appears in graph view")
            .addToggle(toggle => {
                toggle
                    .setValue(settings.showInGraph)
                    .onChange(async (value: boolean) => {
                        settings.showInGraph = value;
                        await this.plugin.store.saveSettings(settings);
                    });
            });

        // Clear all data
        new Setting(containerEl)
            .setName("Clear all data")
            .setDesc("Delete all templates and workout sessions. This cannot be undone.")
            .addButton(btn => {
                btn.setButtonText("Clear All Data");
                const destBtn = btn as unknown as { setDestructive?: () => void, setWarning: () => void };
                if (typeof destBtn.setDestructive === "function") {
                    destBtn.setDestructive();
                } else {
                    destBtn.setWarning();
                }
                btn.onClick(async () => {
                    if (await confirmAction(this.app, "Delete ALL templates and workout data? This cannot be undone.")) {
                        await this.plugin.store.clearAllData();
                            this.refreshTab();
                        }
                    });
            });

        // ═══ Templates ═══
        new Setting(containerEl).setName("🏋️ Templates").setHeading();

        const templates = this.plugin.store.getTemplates();

        if (templates.length === 0) {
            containerEl.createEl("p", {
                text: "No templates yet. Create your first workout template below.",
                cls: "setting-item-description",
            });
        }

        // Render each template
        for (const tpl of templates) {
            this.renderTemplateCard(containerEl, tpl);
        }

        // "Add Template" button
        const addDiv = containerEl.createDiv("gym-settings-add");
        const addBtn = addDiv.createEl("button", {
            text: "+ New Template",
            cls: "gym-settings-add-btn",
        });
        addBtn.onclick = async () => {
            const tpl: WorkoutTemplate = {
                id: this.plugin.store.generateId(),
                name: "New Template",
                exercises: [],
            };
            await this.plugin.store.saveTemplate(tpl);
            this.refreshTab();
        };
    }

    private renderTemplateCard(container: HTMLElement, tpl: WorkoutTemplate): void {
        const card = container.createDiv("gym-template-card");

        // Header (clickable to collapse)
        const header = card.createDiv("gym-template-header");
        const arrow = header.createSpan({ text: "▼", cls: "gym-collapse-arrow" });
        header.createSpan({ text: ` ${tpl.exercises.length} exercises`, cls: "gym-badge" });

        const nameInput = header.createEl("input", {
            cls: "gym-template-name-input",
            attr: { type: "text", value: tpl.name },
        });
        nameInput.onchange = async () => {
            tpl.name = nameInput.value;
            await this.plugin.store.saveTemplate(tpl);
        };
        // Stop click on input from toggling collapse
        nameInput.onclick = (ev: MouseEvent) => ev.stopPropagation();

        const delBtn = header.createEl("button", {
            text: "🗑️",
            cls: "gym-template-delete-btn",
        });
        delBtn.onclick = async (ev: MouseEvent) => {
            ev.stopPropagation();
            await this.plugin.store.deleteTemplate(tpl.id);
            this.refreshTab();
        };

        // Body (collapsible)
        const body = card.createDiv("gym-template-body");

        for (const ex of tpl.exercises) {
            this.renderExerciseCard(body, tpl, ex);
        }

        const addExBtn = body.createEl("button", {
            text: "+ Add Exercise",
            cls: "gym-add-exercise-btn",
        });
        addExBtn.onclick = async () => {
            const newEx: TemplateExercise = {
                id: this.plugin.store.generateId(),
                name: "New Exercise",
                note: "",
                sets: [
                    { setNumber: 1, reps: 8, weight: 0, restSeconds: 90 },
                    { setNumber: 2, reps: 8, weight: 0, restSeconds: 90 },
                    { setNumber: 3, reps: 8, weight: 0, restSeconds: 90 },
                ],
            };
            tpl.exercises.push(newEx);
            await this.plugin.store.saveTemplate(tpl);
            this.refreshTab();
        };

        // Toggle collapse on header click
        header.onclick = () => {
            const collapsed = body.hasClass("gym-collapsed");
            if (collapsed) {
                body.removeClass("gym-collapsed");
                arrow.setText("▼");
            } else {
                body.addClass("gym-collapsed");
                arrow.setText("▶");
            }
        };
    }

    private renderExerciseCard(
        container: HTMLElement,
        tpl: WorkoutTemplate,
        ex: TemplateExercise
    ): void {
        const exCard = container.createDiv("gym-exercise-card");

        // Drag and drop events
        exCard.ondragstart = (ev: DragEvent) => {
            activeDragId = ex.id;
            exCard.addClass("gym-dragging");
            if (ev.dataTransfer) {
                ev.dataTransfer.effectAllowed = "move";
                ev.dataTransfer.setData("text/plain", ex.id);
            }
        };
        exCard.ondragend = () => {
            activeDragId = null;
            exCard.setAttr("draggable", "false");
            exCard.removeClass("gym-dragging");
        };
        exCard.ondragover = (ev: DragEvent) => {
            ev.preventDefault(); // Necessary to allow dropping
            if (ev.dataTransfer) {
                ev.dataTransfer.dropEffect = "move";
            }
            exCard.addClass("gym-drag-over");
        };
        exCard.ondragenter = (ev: DragEvent) => {
            ev.preventDefault();
            exCard.addClass("gym-drag-over");
        };
        exCard.ondragleave = () => {
            exCard.removeClass("gym-drag-over");
        };
        exCard.ondrop = async (ev: DragEvent) => {
            ev.stopPropagation();
            ev.preventDefault();
            exCard.removeClass("gym-drag-over");
            exCard.setAttr("draggable", "false");

            const draggedId = activeDragId || (ev.dataTransfer ? ev.dataTransfer.getData("text/plain") : null);
            if (draggedId && draggedId !== ex.id) {
                // Reorder in tpl.exercises
                const fromIdx = tpl.exercises.findIndex(e => e.id === draggedId);
                const toIdx = tpl.exercises.findIndex(e => e.id === ex.id);
                if (fromIdx >= 0 && toIdx >= 0) {
                    const [moved] = tpl.exercises.splice(fromIdx, 1);
                    tpl.exercises.splice(toIdx, 0, moved);
                    await this.plugin.store.saveTemplate(tpl);
                    this.refreshTab();
                }
            }
        };

        // Header row (clickable to collapse)
        const exHeader = exCard.createDiv("gym-exercise-header-row");
        const exArrow = exHeader.createSpan({ text: "▶", cls: "gym-collapse-arrow" });
        exHeader.createSpan({ text: ` ${ex.sets.length} sets`, cls: "gym-badge" });

        // Exercise name with autocomplete
        const acWrapper = exHeader.createDiv("gym-autocomplete-wrapper");
        const nameInput = acWrapper.createEl("input", {
            cls: "gym-exercise-name-input",
            attr: { type: "text", value: ex.name, autocomplete: "off" },
        });
        // Stop click on input from toggling collapse
        nameInput.onclick = (ev: MouseEvent) => ev.stopPropagation();

        // Dropdown for search results
        const dropdown = acWrapper.createDiv("gym-autocomplete-dropdown");
        let selectedIdx = -1;

        const hideDropdown = () => {
            dropdown.empty();
            dropdown.addClass("gym-hidden");
            selectedIdx = -1;
        };

        const showResults = (results: ReturnType<typeof searchExercises>) => {
            dropdown.empty();
            selectedIdx = -1;
            if (results.length === 0) {
                dropdown.addClass("gym-hidden");
                return;
            }
            dropdown.removeClass("gym-hidden");

            for (let i = 0; i < results.length; i++) {
                const r = results[i];
                const item = dropdown.createDiv("gym-autocomplete-item");
                item.setAttr("data-index", String(i));

                const img = item.createEl("img", {
                    cls: "gym-autocomplete-thumb",
                    attr: { src: imageUrl(r), loading: "lazy" },
                });
                img.onerror = () => { img.addClass("gym-hidden"); };

                const info = item.createDiv("gym-autocomplete-info");
                info.createEl("div", { text: r.name, cls: "gym-autocomplete-name" });

                const tags = info.createDiv("gym-autocomplete-tags");
                if (r.category) {
                    tags.createSpan({ text: r.category, cls: "gym-tag gym-tag-category" });
                }
                if (r.equipment) {
                    tags.createSpan({ text: r.equipment, cls: "gym-tag gym-tag-equipment" });
                }

                item.onmousedown = (ev: MouseEvent) => {
                    ev.preventDefault();
                    selectFromDataset(r);
                };
            }
        };

        const selectFromDataset = (info: ReturnType<typeof searchExercises>[0]) => {
            nameInput.value = info.name;
            ex.name = info.name;
            ex.datasetId = info.id;
            ex.gifUrl = gifUrl(info);
            ex.category = info.category;
            ex.equipment = info.equipment;
            ex.target = info.target;
            ex.muscleGroup = info.muscle_group;
            ex.secondaryMuscles = info.secondary_muscles;
            void this.plugin.store.saveTemplate(tpl);
            hideDropdown();
        };

        nameInput.oninput = () => {
            const results = searchExercises(nameInput.value, 6);
            showResults(results);
        };

        nameInput.onchange = async () => {
            // If user typed manually (didn't click a dropdown item), save as plain text
            const val = nameInput.value.trim();
            if (val && val !== ex.name) {
                ex.name = val;
                // Clear dataset fields since user typed custom name
                ex.datasetId = undefined;
                ex.gifUrl = undefined;
                ex.category = undefined;
                ex.equipment = undefined;
                ex.target = undefined;
                ex.muscleGroup = undefined;
                ex.secondaryMuscles = undefined;
                await this.plugin.store.saveTemplate(tpl);
            }
            hideDropdown();
        };

        nameInput.onkeydown = (ev: KeyboardEvent) => {
            const items = dropdown.querySelectorAll(".gym-autocomplete-item");
            if (ev.key === "ArrowDown") {
                ev.preventDefault();
                selectedIdx = Math.min(selectedIdx + 1, items.length - 1);
                updateAcSelection(items);
            } else if (ev.key === "ArrowUp") {
                ev.preventDefault();
                selectedIdx = Math.max(selectedIdx - 1, 0);
                updateAcSelection(items);
            } else if (ev.key === "Enter" && selectedIdx >= 0 && items[selectedIdx]) {
                ev.preventDefault();
                (items[selectedIdx] as HTMLElement).click();
            } else if (ev.key === "Escape") {
                hideDropdown();
            }
        };

        const updateAcSelection = (items: NodeListOf<Element>) => {
            items.forEach((el, i) => {
                if (i === selectedIdx) {
                    el.addClass("gym-autocomplete-item-selected");
                } else {
                    el.removeClass("gym-autocomplete-item-selected");
                }
            });
        };

        nameInput.onblur = () => {
            window.setTimeout(() => hideDropdown(), 150);
        };

        // Delete exercise
        const delExBtn = exHeader.createEl("button", {
            text: "🗑️",
            cls: "gym-exercise-delete-btn",
        });
        delExBtn.onclick = async (ev: MouseEvent) => {
            ev.stopPropagation();
            tpl.exercises = tpl.exercises.filter(e => e.id !== ex.id);
            await this.plugin.store.saveTemplate(tpl);
            this.refreshTab();
        };

        // Drag handle
        const dragHandle = exHeader.createSpan({
            text: "☰",
            cls: "gym-drag-handle",
            attr: { title: "Drag to reorder" }
        });
        dragHandle.onmousedown = () => exCard.setAttr("draggable", "true");
        dragHandle.onmouseup = () => exCard.setAttr("draggable", "false");
        dragHandle.onmouseleave = () => exCard.setAttr("draggable", "false");
        dragHandle.onclick = (ev: MouseEvent) => ev.stopPropagation();

        // Body (collapsible — note + sets, collapsed by default)
        const exBody = exCard.createDiv("gym-exercise-body gym-collapsed");

        // Exercise note
        const noteInput = exBody.createEl("input", {
            cls: "gym-exercise-note-input",
            attr: { type: "text", value: ex.note || "", placeholder: "Optional note" },
        });
        noteInput.onchange = async () => {
            ex.note = noteInput.value;
            await this.plugin.store.saveTemplate(tpl);
        };

        // Sets table
        const setTable = exBody.createEl("table", "gym-settings-set-table");
        const thead = setTable.createEl("thead");
        const htr = thead.createEl("tr");
        const wLabel = `Weight (${this.plugin.store.getSettings().weightUnit})`;
        ["Set #", "Reps", wLabel, "Rest (s)"].forEach(h => {
            htr.createEl("th", { text: h });
        });

        const tbody = setTable.createEl("tbody");
        for (const set of ex.sets) {
            const tr = tbody.createEl("tr");

            // Set number
            tr.createEl("td", { text: String(set.setNumber) });

            // Reps
            const repsTd = tr.createEl("td");
            const repsInput = repsTd.createEl("input", {
                cls: "gym-set-input",
                attr: { type: "number", min: "0", value: String(set.reps) },
            });
            repsInput.onchange = async () => {
                set.reps = Number(repsInput.value);
                await this.plugin.store.saveTemplate(tpl);
            };

            // Weight
            const wtTd = tr.createEl("td");
            const wtInput = wtTd.createEl("input", {
                cls: "gym-set-input",
                attr: { type: "number", min: "0", step: "0.5", value: String(set.weight) },
            });
            wtInput.onchange = async () => {
                set.weight = Number(wtInput.value);
                await this.plugin.store.saveTemplate(tpl);
            };

            // Rest
            const restTd = tr.createEl("td");
            const restInput = restTd.createEl("input", {
                cls: "gym-set-input",
                attr: { type: "number", min: "0", value: String(set.restSeconds) },
            });
            restInput.onchange = async () => {
                set.restSeconds = Number(restInput.value);
                await this.plugin.store.saveTemplate(tpl);
            };
        }

        // Add/remove set buttons
        const setActions = exBody.createDiv("gym-set-actions");
        const addSetBtn = setActions.createEl("button", { text: "+ Set" });
        addSetBtn.onclick = async () => {
            const lastNum = ex.sets.length > 0 ? ex.sets[ex.sets.length - 1].setNumber : 0;
            const lastSet = ex.sets[ex.sets.length - 1];
            ex.sets.push({
                setNumber: lastNum + 1,
                reps: lastSet ? lastSet.reps : 8,
                weight: lastSet ? lastSet.weight : 0,
                restSeconds: lastSet ? lastSet.restSeconds : 90,
            });
            await this.plugin.store.saveTemplate(tpl);
            this.refreshTab();
        };

        const removeSetBtn = setActions.createEl("button", { text: "- Last Set" });
        removeSetBtn.onclick = async () => {
            if (ex.sets.length > 1) {
                ex.sets.pop();
                await this.plugin.store.saveTemplate(tpl);
                this.refreshTab();
            }
        };

        // Toggle collapse on header click
        exHeader.onclick = () => {
            const collapsed = exBody.hasClass("gym-collapsed");
            if (collapsed) {
                exBody.removeClass("gym-collapsed");
                exArrow.setText("▼");
            } else {
                exBody.addClass("gym-collapsed");
                exArrow.setText("▶");
            }
        };
    }
}
