import { Providers } from "../providers";

// The /app segment hosts the mandate-tree dashboard. The Solana wallet adapter
// (Providers) is scoped here so the marketing home at / is NOT wrapped in it.
// The .app-main wrapper restores the dashboard shell's vertical padding (the
// shared .wrap carries horizontal padding only, so the landing can reuse it).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="app-main">{children}</div>
    </Providers>
  );
}
