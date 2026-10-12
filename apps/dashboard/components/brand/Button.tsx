import type * as React from "react";

// One action, verb-first sentence case. primary (verdigris) at most once per view;
// danger (cinnabar outline) for freeze/revoke/close.
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  size?: "md" | "sm";
}

export function Button({ variant = "secondary", size = "md", className, children, ...rest }: ButtonProps) {
  const cls = `q-btn q-btn-${variant}${size === "sm" ? " q-btn-sm" : ""}${className ? ` ${className}` : ""}`;
  return (
    <button type="button" {...rest} className={cls}>
      {children}
    </button>
  );
}
