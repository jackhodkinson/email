export interface Command {
  id: string;
  name: string;
  shortcut?: string;
  execute: () => void;
}

export interface CommandContext {
  navigate: (to: string, params?: Record<string, string>, search?: Record<string, unknown>) => void;
  emails: Array<{ id: string }>;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  focusList: () => void;
  focusViewer: () => void;
  focusSearch: () => void;
  searchParams?: Record<string, unknown>;
}

export function createCommands(ctx: CommandContext): Record<string, Command> {
  return {
    selectNextEmail: {
      id: "selectNextEmail",
      name: "Next email",
      shortcut: "↓",
      execute: () => {
        if (ctx.emails.length === 0) return;
        const next = Math.min(ctx.selectedIndex + 1, ctx.emails.length - 1);
        if (next === ctx.selectedIndex) return;
        ctx.setSelectedIndex(next);
      },
    },

    selectPreviousEmail: {
      id: "selectPreviousEmail",
      name: "Previous email",
      shortcut: "↑",
      execute: () => {
        if (ctx.emails.length === 0) return;
        const prev = Math.max(ctx.selectedIndex - 1, 0);
        if (prev === ctx.selectedIndex) return;
        ctx.setSelectedIndex(prev);
      },
    },

    openSelectedEmail: {
      id: "openSelectedEmail",
      name: "Open email",
      shortcut: "Enter",
      execute: () => {
        if (ctx.emails.length === 0) return;
        if (ctx.selectedIndex < 0) {
          ctx.setSelectedIndex(0);
          return;
        }
        const email = ctx.emails[ctx.selectedIndex];
        if (email) {
          ctx.navigate("/email/$id", { id: email.id }, ctx.searchParams);
        }
      },
    },

    goToInbox: {
      id: "goToInbox",
      name: "Back to inbox",
      shortcut: "Escape",
      execute: () => {
        ctx.navigate("/", undefined, { q: undefined });
      },
    },

    focusEmailList: {
      id: "focusEmailList",
      name: "Focus list",
      shortcut: "←",
      execute: () => {
        ctx.focusList();
      },
    },

    focusEmailViewer: {
      id: "focusEmailViewer",
      name: "Focus viewer",
      shortcut: "→",
      execute: () => {
        ctx.focusViewer();
      },
    },

    focusSearch: {
      id: "focusSearch",
      name: "Search",
      shortcut: "/",
      execute: () => {
        ctx.focusSearch();
      },
    },
  };
}
