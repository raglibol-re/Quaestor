import type { Metadata } from "next";
import { Instrument_Serif, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const display = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const sans = IBM_Plex_Sans({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

// The home page (/) is the marketing landing, so the root metadata uses the
// landing's social (Open Graph / Twitter) metadata. opengraph-image.png and
// twitter-image.png in this directory are picked up automatically by Next.js.
const TITLE = "Quaestor — give your agent a mandate, not a wallet";
const DESCRIPTION =
  "Hierarchical, onchain-enforced USDC spending mandates for AI agents. Fund a tree of agents, cap every branch, freeze any of it instantly — accessed over MCP. Set up in minutes.";

export const metadata: Metadata = {
  metadataBase: new URL("https://quaestor-dashboard.vercel.app"),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    url: "https://quaestor-dashboard.vercel.app",
    siteName: "Quaestor",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="basalt"
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('quaestor-theme');if(t==='travertine'||t==='basalt'){document.documentElement.dataset.theme=t;}}catch(e){}",
          }}
        />
        {children}
      </body>
    </html>
  );
}
