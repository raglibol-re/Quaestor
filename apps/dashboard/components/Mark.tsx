// Quaestor mark — ring (vault/coin) whose tail forks into two square nodes.
// Single-colour via currentColor so it inherits verdigris/ink from context.
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
    >
      <circle cx={28} cy={28} r={19} strokeWidth={6} />
      <path d="M41 41 L50 50 M50 50 H59 M50 50 V59" strokeWidth={5} strokeLinecap="square" />
      <rect x={56} y={47} width={6} height={6} fill="currentColor" stroke="none" />
      <rect x={47} y={56} width={6} height={6} fill="currentColor" stroke="none" />
    </svg>
  );
}
