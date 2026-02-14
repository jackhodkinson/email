export type Surface = "global" | "list" | "viewer" | "composer" | "modal";

export interface ShortcutMapping {
  key: string;
  command: string;
  surface: Surface;
}

export const shortcuts: ShortcutMapping[] = [
  { key: "Escape", command: "goToInbox", surface: "global" },
  { key: "ArrowDown", command: "selectNextEmail", surface: "list" },
  { key: "ArrowUp", command: "selectPreviousEmail", surface: "list" },
  { key: "Enter", command: "openSelectedEmail", surface: "list" },
  { key: "ArrowRight", command: "focusEmailViewer", surface: "list" },
  { key: "j", command: "selectNextEmail", surface: "list" },
  { key: "k", command: "selectPreviousEmail", surface: "list" },
  { key: "ArrowLeft", command: "focusEmailList", surface: "viewer" },
  { key: "/", command: "focusSearch", surface: "list" },
];

export function getShortcutsForSurface(surface: Surface): ShortcutMapping[] {
  return shortcuts.filter(
    (shortcut) => shortcut.surface === "global" || shortcut.surface === surface,
  );
}
