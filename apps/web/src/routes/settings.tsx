import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Inbox, Monitor, Moon, Palette, Sun } from "lucide-react";

import { type ThemePreference, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab === "inboxes" ? ("inboxes" as const) : ("appearance" as const),
  }),
  component: SettingsPage,
});

type SettingsTab = "appearance" | "inboxes";

const themeOptions: Array<{
  value: ThemePreference;
  label: string;
  description: string;
  icon: typeof Monitor;
}> = [
  {
    value: "system",
    label: "System",
    description: "Follow this device's appearance.",
    icon: Monitor,
  },
  {
    value: "light",
    label: "Light",
    description: "Use a light interface.",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Use a dark interface.",
    icon: Moon,
  },
];

function SettingsPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { preference, setPreference, effectiveTheme } = useTheme();

  function setTab(nextTab: SettingsTab) {
    navigate({
      search: { tab: nextTab === "appearance" ? undefined : nextTab },
    });
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[16rem_1fr] bg-background">
      <aside className="flex min-h-0 flex-col border-r bg-sidebar text-sidebar-foreground">
        <div className="flex h-14 shrink-0 items-center px-3">
          <Link
            to="/"
            className="inline-flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
            search={{
              q: undefined,
              threads: undefined,
              category: undefined,
              label: undefined,
              compose: undefined,
              replyTo: undefined,
            }}
          >
            <ArrowLeft className="size-4" />
            Back to app
          </Link>
        </div>
        <nav className="flex-1 overflow-auto px-3 py-2">
          <div className="mb-2 px-2 text-xs font-medium text-sidebar-foreground/60">
            Settings
          </div>
          <div className="space-y-1">
            <SettingsTabButton
              active={tab === "appearance"}
              icon={Palette}
              label="Appearance"
              onClick={() => setTab("appearance")}
            />
            <SettingsTabButton
              active={tab === "inboxes"}
              icon={Inbox}
              label="Inboxes"
              onClick={() => setTab("inboxes")}
            />
          </div>
        </nav>
      </aside>

      <main className="min-h-0 overflow-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10 lg:px-10">
          {tab === "appearance" ? (
            <AppearanceSettings
              effectiveTheme={effectiveTheme}
              preference={preference}
              setPreference={setPreference}
            />
          ) : (
            <InboxesSettings />
          )}
        </div>
      </main>
    </div>
  );
}

function SettingsTabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Palette;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      <Icon className="size-4" />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

function AppearanceSettings({
  effectiveTheme,
  preference,
  setPreference,
}: {
  effectiveTheme: string;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}) {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Appearance</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose how the app should look on this device.
        </p>
      </div>

      <section className="rounded-lg border bg-card text-card-foreground shadow-xs">
        <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-[220px_1fr]">
          <div>
            <h2 className="text-sm font-medium">Theme</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Current theme: {preference === "system" ? `System (${effectiveTheme})` : preference}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const selected = preference === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "group flex min-h-24 items-start gap-3 rounded-lg border bg-background p-4 text-left shadow-xs transition-colors hover:border-ring focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
                    selected && "border-primary ring-1 ring-primary",
                  )}
                  aria-pressed={selected}
                  onClick={() => setPreference(option.value)}
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-xs leading-4 text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border",
                    )}
                  >
                    {selected ? <Check className="size-3" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}

function InboxesSettings() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Inboxes</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage inbox-specific preferences.
        </p>
      </div>

      <section className="rounded-lg border bg-card p-8 text-card-foreground shadow-xs">
        <div className="mx-auto max-w-md text-center">
          <Inbox className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-4 text-sm font-medium">Inbox settings coming soon</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This section will hold per-inbox configuration and routing options.
          </p>
        </div>
      </section>
    </>
  );
}
