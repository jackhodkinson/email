import { useEffect, useCallback } from "react";

/**
 * Map of key names to handler functions
 */
export type KeyboardHandlers = {
  [key: string]: () => void;
};

/**
 * Check if the currently focused element is an input field
 */
function isInputFocused(): boolean {
  const activeElement = document.activeElement;
  if (!activeElement) return false;

  const tagName = activeElement.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }

  // Check for contentEditable elements
  if ((activeElement as HTMLElement).isContentEditable) {
    return true;
  }

  return false;
}

/**
 * Hook for handling keyboard shortcuts.
 *
 * Listens for keydown events and calls the appropriate handler.
 * Ignores events when the user is typing in an input field.
 *
 * @param handlers - Map of key names to handler functions
 *
 * @example
 * ```tsx
 * useKeyboard({
 *   ArrowDown: () => selectNext(),
 *   ArrowUp: () => selectPrevious(),
 *   Enter: () => openSelected(),
 *   Escape: () => goBack(),
 * });
 * ```
 */
export function useKeyboard(handlers: KeyboardHandlers): void {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Ignore if typing in an input field
      if (isInputFocused()) return;

      const handler = handlers[event.key];
      if (handler) {
        event.preventDefault();
        handler();
      }
    },
    [handlers]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
