"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      window.setTimeout(() => setDone(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — no-op; the text is still selectable.
    }
  }

  return (
    <button type="button" className={`copy-btn${done ? " done" : ""}`} onClick={copy}>
      {done ? "Copied" : label}
    </button>
  );
}
