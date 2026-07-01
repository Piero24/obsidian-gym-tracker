import { CalendarDay, WorkoutSession } from "../types";

/**
 * Format a Date as "YYYY-MM-DD".
 */
export function formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/**
 * Is `dateStr` today?
 */
export function isToday(dateStr: string): boolean {
    return dateStr === formatDate(new Date());
}

/**
 * Get today as "YYYY-MM-DD".
 */
export function todayStr(): string {
    return formatDate(new Date());
}

/**
 * Build a 42-cell calendar grid (6 weeks × 7 days) for the given month.
 * Returns CalendarDay objects — some belong to prev/next month.
 */
export function getMonthGrid(year: number, month: number, sessions: Record<string, WorkoutSession>, weekStartDay: 'monday' | 'sunday' = 'monday'): CalendarDay[] {
    const today = todayStr();

    // First day of the month
    const firstOfMonth = new Date(year, month, 1);
    // Day of week (0 = Sun, 6 = Sat)
    let startDay = firstOfMonth.getDay();
    if (weekStartDay === 'monday') {
        startDay = startDay === 0 ? 6 : startDay - 1;
    }
    // For sunday start, startDay stays as-is (0 = Sunday)

    // Build 42 cells
    const cells: CalendarDay[] = [];
    for (let i = 0; i < 42; i++) {
        const cellDate = new Date(year, month, 1 - startDay + i);
        const dateStr = formatDate(cellDate);
        const isCurrentMonth = cellDate.getMonth() === month;

        cells.push({
            date: dateStr,
            day: cellDate.getDate(),
            isCurrentMonth,
            isToday: dateStr === today,
            hasSession: !!sessions[dateStr],
            session: sessions[dateStr],
        });
    }

    return cells;
}

/**
 * Get the month name for display.
 */
export function monthName(year: number, month: number): string {
    const d = new Date(year, month, 1);
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Get previous month/year from current.
 */
export function prevMonth(year: number, month: number): { year: number; month: number } {
    if (month === 0) return { year: year - 1, month: 11 };
    return { year, month: month - 1 };
}

/**
 * Get next month/year from current.
 */
export function nextMonth(year: number, month: number): { year: number; month: number } {
    if (month === 11) return { year: year + 1, month: 0 };
    return { year, month: month + 1 };
}
