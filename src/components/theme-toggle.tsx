import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const THEME_KEY = "month-check-theme";

function readTheme(): boolean {
  return document.documentElement.classList.contains("dark");
}

function applyTheme(isDark: boolean) {
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", isDark ? "#111315" : "#F5F6F5");
}

export function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const currentTheme = readTheme();
    applyTheme(currentTheme);
    setIsDark(currentTheme);

    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemThemeChange = (event: MediaQueryListEvent) => {
      try {
        if (window.localStorage.getItem(THEME_KEY) !== null) return;
      } catch {
        // Follow the current system preference if local storage is unavailable.
      }
      applyTheme(event.matches);
      setIsDark(event.matches);
    };
    colorScheme.addEventListener("change", onSystemThemeChange);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_KEY) return;
      const nextIsDark = event.newValue === "dark";
      applyTheme(
        event.newValue === null
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
          : nextIsDark,
      );
      setIsDark(readTheme());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      colorScheme.removeEventListener("change", onSystemThemeChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function toggleTheme() {
    const nextIsDark = !readTheme();
    applyTheme(nextIsDark);
    setIsDark(nextIsDark);
    try {
      window.localStorage.setItem(THEME_KEY, nextIsDark ? "dark" : "light");
    } catch {
      // The current page still changes theme when browser storage is unavailable.
    }
  }

  const label = isDark ? "Ativar modo claro" : "Ativar modo noturno";
  const Icon = isDark ? Sun : Moon;

  return (
    <Button
      type="button"
      variant="ghost"
      size={showLabel ? "default" : "icon"}
      onClick={toggleTheme}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {showLabel && <span>{isDark ? "Modo claro" : "Modo noturno"}</span>}
    </Button>
  );
}
