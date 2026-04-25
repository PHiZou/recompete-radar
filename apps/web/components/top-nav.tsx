"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs: { label: string; href: string; match: (p: string) => boolean }[] = [
  { label: "Radar", href: "/", match: (p) => p === "/" },
  {
    label: "Vendor",
    href: "/vendors/VV9KH3L99VE3",
    match: (p) => p.startsWith("/vendors"),
  },
  {
    label: "Agency",
    href: "/agencies/70",
    match: (p) => p.startsWith("/agencies"),
  },
];

export default function TopNav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-[#1f1f23] bg-[#0a0a0c] sticky top-0 z-20 backdrop-blur">
      <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0a0a0c"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
              <circle cx="12" cy="12" r="3" fill="#0a0a0c" />
            </svg>
          </div>
          <span className="font-semibold tracking-tight">Sunlight</span>
          <span className="text-xs text-zinc-500 border border-[#1f1f23] rounded-md px-2 py-0.5 ml-1 mono">
            mvp · preview
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          {tabs.map((tab) => {
            const active = tab.match(pathname);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={
                  "px-3 h-9 flex items-center text-sm border-b-2 " +
                  (active
                    ? "text-zinc-50 border-zinc-50"
                    : "text-zinc-500 border-transparent hover:text-zinc-300")
                }
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <span className="kbd">⌘ K</span>
          <span className="mono text-xs">v0.1 · FY2020–2025</span>
        </div>
      </div>
    </header>
  );
}
