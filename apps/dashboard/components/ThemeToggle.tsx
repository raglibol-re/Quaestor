"use client";

import { useEffect, useState } from "react";

type Theme = "basalt" | "travertine";

// Toggles the two brand themes (Basalt dark / Travertine light) by flipping
// data-theme on <html>, persisted to localStorage. The pre-hydration script in
// layout.tsx applies the saved value before paint so there's no flash.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("basalt");

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "travertine" ? "travertine" : "basalt");
  }, []);

  function toggle() {
    const next: Theme = theme === "basalt" ? "travertine" : "basalt";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("quaestor-theme", next);
    } catch {
      // localStorage unavailable — theme still applies for this session.
    }
  }

  return (
    <button
      type="button"
      className="nav-link theme-toggle"
      onClick={toggle}
      aria-label={`Switch to ${theme === "basalt" ? "light" : "dark"} theme`}
    >
      {theme === "basalt" ? "Light" : "Dark"}
    </button>
  );
}
