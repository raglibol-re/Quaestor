import { formatUSDC, type BaseUnits } from "@quaestor/sdk";

const toNum = (x: BaseUnits) => (typeof x === "number" ? x : Number(x.toString()));

// limit splits into spent (verdigris), reserved (hatched aurum) and available (empty track).
// When spent + reserved exceeds the limit, the spent segment turns cinnabar.
export function BudgetMeter({
  limit,
  spent,
  reserved,
  legend = true,
}: {
  limit: BaseUnits;
  spent: BaseUnits;
  reserved: BaseUnits;
  legend?: boolean;
}) {
  const L = Math.max(toNum(limit), 1e-6);
  const S = toNum(spent);
  const R = toNum(reserved);
  const over = S + R > L;
  const sp = Math.min(S / L, 1) * 100;
  const rs = Math.max(Math.min(R / L, 1 - sp / 100), 0) * 100;
  const avail = Math.max(toNum(limit) - S - R, 0);

  return (
    <div className={`q-meter${over ? " q-meter-over" : ""}`}>
      <div
        className="q-meter-track"
        role="img"
        aria-label={`${formatUSDC(spent)} spent, ${formatUSDC(reserved)} reserved, ${formatUSDC(
          Math.round(avail)
        )} available of ${formatUSDC(limit)} USDC`}
      >
        <div className="q-meter-spent" style={{ width: `${sp}%` }} />
        <div className="q-meter-reserved" style={{ width: `${rs}%` }} />
      </div>
      {legend && (
        <div className="q-meter-legend">
          <span>
            <i className="q-meter-key" style={{ background: over ? "var(--cinnabar)" : "var(--verdigris)" }} />
            Spent <b>{formatUSDC(spent)}</b>
          </span>
          <span>
            <i className="q-meter-key" style={{ background: "var(--aurum)" }} />
            Reserved <b>{formatUSDC(reserved)}</b>
          </span>
          <span>
            <i
              className="q-meter-key"
              style={{ background: "var(--surface-sunken)", boxShadow: "inset 0 0 0 1px var(--line-strong)" }}
            />
            Available <b>{formatUSDC(Math.round(avail))}</b>
          </span>
        </div>
      )}
    </div>
  );
}
