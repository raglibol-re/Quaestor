import { formatUSDC, type BaseUnits } from "@quaestor/sdk";

// Money in IBM Plex Mono: two decimals, tabular figures, muted unit.
// Takes base units (USDC has 6 decimals) and formats with the shared helper.
export function Amount({
  value,
  unit = "USDC",
  size = "md",
  tone,
}: {
  value: BaseUnits;
  unit?: string | null;
  size?: "md" | "lg";
  tone?: "active" | "reserved" | "rejected";
}) {
  const cls = `q-amount q-amount-${size}${tone ? ` q-tone-${tone}` : ""}`;
  return (
    <span className={cls}>
      {formatUSDC(value)}
      {unit ? <span className="q-amount-unit">{unit}</span> : null}
    </span>
  );
}
