import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const STORAGE_KEY = "theme";

export type ThemePreference = "light" | "dark" | "system";
export type EffectiveTheme = "light" | "dark";

function getStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system")
    return stored;
  return "system";
}

function getSystemDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getEffectiveDark(preference: ThemePreference, systemDark: boolean): boolean {
  if (preference === "light") return false;
  if (preference === "dark") return true;
  return systemDark;
}

function applyToDocument(dark: boolean): void {
  document.documentElement.classList.toggle("dark", dark);
}

function subscribeToSystem(cb: () => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** Inline script run in head to avoid FOUC. Must be valid JS, no ES modules. */
export const THEME_INIT_SCRIPT = `
(function(){
  try {
    var p = localStorage.getItem("theme");
    if (p !== "light" && p !== "dark") p = "system";
    var dark = p === "dark" || (p === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
})();
`;

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  effectiveTheme: EffectiveTheme;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    setPreferenceState(getStoredPreference());
    setSystemDark(getSystemDark());
    const onStorage = () => setPreferenceState(getStoredPreference());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (preference !== "system") return;
    const cleanup = subscribeToSystem(() => setSystemDark(getSystemDark()));
    return cleanup;
  }, [preference]);

  const effectiveDark = getEffectiveDark(preference, systemDark);
  const effectiveTheme: EffectiveTheme = effectiveDark ? "dark" : "light";

  useEffect(() => {
    applyToDocument(effectiveDark);
  }, [effectiveDark]);

  const setPreference = useCallback((p: ThemePreference) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, p);
    setPreferenceState(p);
    if (p === "system") setSystemDark(getSystemDark());
  }, []);

  const value: ThemeContextValue = {
    preference,
    setPreference,
    effectiveTheme,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
