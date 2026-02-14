import { Moon, Sun, Monitor } from "lucide-react";
import type { ThemePreference } from "@/lib/theme";
import { useTheme } from "@/lib/theme";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const cycle: ThemePreference[] = ["light", "dark", "system"];

function nextPreference(current: ThemePreference): ThemePreference {
  const i = cycle.indexOf(current);
  return cycle[(i + 1) % cycle.length];
}

function label(p: ThemePreference): string {
  switch (p) {
    case "light":
      return "Light";
    case "dark":
      return "Dark";
    case "system":
      return "System";
  }
}

function Icon({ preference }: { preference: ThemePreference }) {
  if (preference === "system") return <Monitor className="size-4" />;
  return preference === "dark" ? (
    <Moon className="size-4" />
  ) : (
    <Sun className="size-4" />
  );
}

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip={`Theme: ${label(preference)} (click to cycle)`}
          onClick={() => setPreference(nextPreference(preference))}
        >
          <Icon preference={preference} />
          <span>Theme: {label(preference)}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
