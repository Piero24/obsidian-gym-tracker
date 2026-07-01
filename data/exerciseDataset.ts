import exercises from "./exercises.json";

export interface ExerciseInfo {
    id: string;
    name: string;
    category: string;
    equipment: string;
    target: string;
    muscle_group: string;
    secondary_muscles: string[];
    gif_url: string;
    image: string;
}

const BASE_URL = "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/";

const dataset: ExerciseInfo[] = exercises;

/**
 * Search exercises by name (case-insensitive substring match).
 * Returns up to `limit` results sorted by match quality.
 */
export function searchExercises(query: string, limit: number = 8): ExerciseInfo[] {
    if (!query || query.trim().length < 1) return [];

    const q = query.toLowerCase().trim();
    const results: { exercise: ExerciseInfo; score: number }[] = [];

    for (const ex of dataset) {
        const name = ex.name.toLowerCase();
        const idx = name.indexOf(q);
        if (idx >= 0) {
            // Score: exact match > starts with > contains
            let score = 0;
            if (name === q) {
                score = 3;
            } else if (idx === 0) {
                score = 2;
            } else {
                score = 1;
            }
            // Bonus for matching category or equipment
            if (ex.category.toLowerCase().includes(q)) score += 0.5;
            if (ex.equipment.toLowerCase().includes(q)) score += 0.5;
            results.push({ exercise: ex, score });
        }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit).map(r => r.exercise);
}

/**
 * Build the full GitHub raw URL for an exercise GIF.
 */
export function gifUrl(exercise: ExerciseInfo): string {
    if (!exercise.gif_url) return "";
    return BASE_URL + exercise.gif_url;
}

/**
 * Build the full GitHub raw URL for an exercise thumbnail image.
 */
export function imageUrl(exercise: ExerciseInfo): string {
    if (!exercise.image) return "";
    return BASE_URL + exercise.image;
}
