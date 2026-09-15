import type { Metadata } from "next";
import TopNav from "@/components/top-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sunlight",
  description:
    "Explainable intelligence on federal contracting recompetes, incumbents, and market white space.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <TopNav />
        <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 sm:py-6">
          {children}
        </main>
        <footer className="max-w-[1400px] mx-auto px-4 sm:px-6 mt-8 pb-10 text-xs text-zinc-500 flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
          <div>
            Data: USASpending.gov prime award summaries · multi-agency IT/data
            services scope · obligated $
          </div>
          <div className="mono">derived from public federal data</div>
        </footer>
      </body>
    </html>
  );
}
