"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs: { label: string; href: string; match: (p: string) => boolean }[] = [
  { label: "Radar", href: "/", match: (p) => p === "/" },
  {
    label: "Vendor",
    href: "/vendors/leidos",
    match: (p) => p.startsWith("/vendors"),
  },
  {
    label: "Agency",
    href: "/agencies/dhs",
    match: (p) => p.startsWith("/agencies"),
  },
  {
    label: "Insights",
    href: "/insights",
    match: (p) => p.startsWith("/insights"),
  },
];

export default function TopNav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-[#d8d0bd] bg-[#fdf6e3]/95 sticky top-0 z-20 backdrop-blur">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 min-h-14 py-2 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#2a6f83] to-[#174e5d] flex items-center justify-center shrink-0">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fdf6e3"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
              <circle cx="12" cy="12" r="3" fill="#fdf6e3" />
            </svg>
          </div>
          <span className="font-semibold tracking-tight text-[#20343d]">
            Sunlight
          </span>
          <span className="hidden sm:inline text-xs text-zinc-500 border border-[#d8d0bd] rounded-md px-2 py-0.5 ml-1 mono">
            mvp · preview
          </span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto ml-auto">
          {tabs.map((tab) => {
            const active = tab.match(pathname);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={
                  "px-2 sm:px-3 h-9 flex items-center text-sm border-b-2 whitespace-nowrap " +
                  (active
                    ? "text-[#20343d] border-[#20343d]"
                    : "text-zinc-500 border-transparent hover:text-zinc-300")
                }
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden lg:flex items-center gap-3 text-sm text-zinc-400">
          <span className="kbd">⌘ K</span>
          <span className="mono text-xs">v0.1 · multi-agency</span>
        </div>
      </div>
    </header>
  );
}
