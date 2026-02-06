import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { createCommands, Command, CommandContext } from "./index";

interface UseCommandsOptions {
  emails: Array<{ id: string }>;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  focusList: () => void;
  focusViewer: () => void;
  focusSearch: () => void;
  searchParams?: Record<string, unknown>;
}

export function useCommands(options: UseCommandsOptions): Record<string, Command> {
  const navigate = useNavigate();

  const commands = useMemo(() => {
    const ctx: CommandContext = {
      navigate: (to, params, search) => navigate({ to, params, search } as any),
      emails: options.emails,
      selectedIndex: options.selectedIndex,
      setSelectedIndex: options.setSelectedIndex,
      focusList: options.focusList,
      focusViewer: options.focusViewer,
      focusSearch: options.focusSearch,
      searchParams: options.searchParams,
    };

    return createCommands(ctx);
  }, [
    navigate,
    options.emails,
    options.selectedIndex,
    options.setSelectedIndex,
    options.focusList,
    options.focusViewer,
    options.focusSearch,
    options.searchParams,
  ]);

  return commands;
}
