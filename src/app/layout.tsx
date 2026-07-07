import type { Metadata } from "next";
import "./globals.css";
import NavLink from "./NavLink";

export const metadata: Metadata = {
  title: "Hermes // Polymarket Copy Research",
  description: "Paper-trading-only Polymarket copy trading research system, operated by Hermes Agent.",
};

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/wallets", label: "Wallet Rankings" },
  { href: "/signals", label: "Trade Signals" },
  { href: "/paper-trades", label: "Paper Trades" },
  { href: "/decisions", label: "Decision Journal" },
  { href: "/performance", label: "Performance" },
  { href: "/rules", label: "Rules" },
  { href: "/reports", label: "Reports" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-mono min-h-screen">
        <div className="flex min-h-screen">
          <aside className="w-60 shrink-0 border-r border-border bg-panel px-4 py-6 hidden md:block">
            <div className="mb-8">
              <div className="text-accent text-sm tracking-widest uppercase">Hermes</div>
              <div className="text-muted text-xs mt-1">Polymarket Copy Research</div>
              <div className="mt-3">
                <span className="badge badge-track">Paper trading only</span>
              </div>
            </div>
            <nav className="space-y-1">
              {NAV.map((item) => (
                <NavLink key={item.href} href={item.href} label={item.label} />
              ))}
            </nav>
          </aside>
          <main className="flex-1 px-6 py-6 md:px-10 md:py-8 max-w-6xl mx-auto w-full">{children}</main>
        </div>
      </body>
    </html>
  );
}
