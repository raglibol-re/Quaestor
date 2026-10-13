import type { Metadata } from "next";
import { Providers } from "./providers";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quaestor connector",
  description: "Remote MCP connector for Quaestor mandates — give agents budgets, not keys.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
