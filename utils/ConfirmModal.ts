import { App, Modal } from "obsidian";

/**
 * A native Obsidian confirmation modal that replaces window.confirm().
 * Returns a Promise<boolean> resolved when the user clicks Confirm or Cancel.
 */
class ConfirmModal extends Modal {
    private message: string;
    private resolve: (value: boolean) => void;

    constructor(app: App, message: string, resolve: (value: boolean) => void) {
        super(app);
        this.message = message;
        this.resolve = resolve;
    }

    onOpen(): void {
        const { contentEl } = this;

        contentEl.createEl("p", { text: this.message });

        const btnRow = contentEl.createDiv("modal-button-container");

        const confirmBtn = btnRow.createEl("button", {
            text: "Confirm",
            cls: "mod-warning",
        });
        confirmBtn.addEventListener("click", () => {
            this.resolve(true);
            this.close();
        });

        const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
        cancelBtn.addEventListener("click", () => {
            this.resolve(false);
            this.close();
        });
    }

    onClose(): void {
        // If the modal is dismissed without clicking a button, treat as cancel.
        this.resolve(false);
        this.contentEl.empty();
    }
}

/**
 * Show a native Obsidian confirmation dialog.
 * Resolves `true` if the user confirms, `false` otherwise.
 */
export function confirmAction(app: App, message: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        let resolved = false;
        const wrappedResolve = (value: boolean): void => {
            if (!resolved) {
                resolved = true;
                resolve(value);
            }
        };
        new ConfirmModal(app, message, wrappedResolve).open();
    });
}
