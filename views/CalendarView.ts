import { ItemView, WorkspaceLeaf } from "obsidian";
import { DataStore } from "../data/DataStore";
import {
    getMonthGrid,
    monthName,
    prevMonth,
    nextMonth,
} from "../utils/calendar";

export const CALENDAR_VIEW_TYPE = "gym-tracker-calendar";

export class CalendarView extends ItemView {
    private store: DataStore;
    private onDateClick: (date: string) => void;
    private onStartWorkout: () => void;
    private currentYear: number;
    private currentMonth: number;

    constructor(
        leaf: WorkspaceLeaf,
        store: DataStore,
        onDateClick: (date: string) => void,
        onStartWorkout: () => void
    ) {
        super(leaf);
        this.store = store;
        this.onDateClick = onDateClick;
        this.onStartWorkout = onStartWorkout;

        const today = new Date();
        this.currentYear = today.getFullYear();
        this.currentMonth = today.getMonth();
    }

    getViewType(): string {
        return CALENDAR_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "Gym Calendar";
    }

    getIcon(): string {
        return "dumbbell";
    }

    async onOpen(): Promise<void> {
        this.render();
    }

    refresh(): void {
        this.render();
    }

    private render(): void {
        const container = this.contentEl;
        container.empty();
        container.addClass("gym-calendar-container");

        const settings = this.store.getSettings();
        const data = this.store.getData();
        const grid = getMonthGrid(
            this.currentYear,
            this.currentMonth,
            data.sessions,
            settings.weekStartDay
        );

        // ── Header with navigation ──
        const header = container.createDiv("gym-calendar-header");
        const prevBtn = header.createEl("button", {
            text: "←",
            cls: "gym-calendar-nav",
        });
        header.createEl("span", {
            text: monthName(this.currentYear, this.currentMonth),
            cls: "gym-calendar-title",
        });
        const nextBtn = header.createEl("button", {
            text: "→",
            cls: "gym-calendar-nav",
        });

        prevBtn.onclick = () => {
            const p = prevMonth(this.currentYear, this.currentMonth);
            this.currentYear = p.year;
            this.currentMonth = p.month;
            this.render();
        };
        nextBtn.onclick = () => {
            const n = nextMonth(this.currentYear, this.currentMonth);
            this.currentYear = n.year;
            this.currentMonth = n.month;
            this.render();
        };

        // ── Day-of-week labels ──
        const dowRow = container.createDiv("gym-calendar-dow");
        const dayNames = settings.weekStartDay === 'sunday'
            ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
            : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        for (const name of dayNames) {
            dowRow.createEl("span", { text: name, cls: "gym-calendar-dow-cell" });
        }

        // ── Day grid ──
        const dayGrid = container.createDiv("gym-calendar-grid");

        for (const day of grid) {
            const cell = dayGrid.createDiv("gym-calendar-cell");

            if (!day.isCurrentMonth) {
                cell.addClass("gym-calendar-cell-other");
            }
            if (day.isToday) {
                cell.addClass("gym-calendar-cell-today");
            }

            cell.createSpan({ text: String(day.day) });

            if (day.hasSession) {
                cell.addClass("gym-calendar-cell-workout");
            }

            if (day.isCurrentMonth) {
                cell.onclick = () => this.onDateClick(day.date);
            }
        }

        // ── "Start Workout" button ──
        const footer = container.createDiv("gym-calendar-footer");
        const startBtn = footer.createEl("button", {
            text: "🏋️ Start Workout",
            cls: "gym-calendar-start-btn",
        });
        startBtn.onclick = () => this.onStartWorkout();

        // ── Quick-jump to today ──
        const todayBtn = footer.createEl("button", {
            text: "Today",
            cls: "gym-calendar-today-btn",
        });
        todayBtn.onclick = () => {
            const today = new Date();
            this.currentYear = today.getFullYear();
            this.currentMonth = today.getMonth();
            this.render();
        };
    }
}
