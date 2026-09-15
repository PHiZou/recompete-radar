import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Insights · Sunlight",
  description:
    "What five agencies of federal IT contract data actually say about competition, incumbents, and recompetes.",
};

// All figures below are static, copied from the result comments in
// sql/analysis.sql (run 2026-08-07). Re-run those queries to refresh them.

const singleOfferByAgency = [
  { agency: "SSA", pct: 61.9 },
  { agency: "DHS", pct: 60.1 },
  { agency: "HHS", pct: 55.6 },
  { agency: "VA", pct: 55.0 },
  { agency: "Commerce", pct: 54.3 },
];

const strengthCaps = [
  { component: "is_lifetime_pts", cap: 30, note: "hits ceiling at $3.27M lifetime" },
  { component: "is_recency_pts", cap: 20, note: "" },
  { component: "is_breadth_pts", cap: 15, note: "" },
];

const retentionBySize = [
  { q: "Q1", band: "$0.3–18.4M", pct: 28.8, prior: 22.9 },
  { q: "Q2", band: "$18.4–82.1M", pct: 37.7, prior: 38.8, tag: "best" },
  { q: "Q3", band: "$82.1–228.8M", pct: 28.7, prior: 28.4 },
  { q: "Q4", band: "$228.8M–1.05B", pct: 31.1, prior: 27.6 },
  { q: "Q5", band: "$1.05–10.5B", pct: 24.1, prior: 22.0, tag: "worst" },
];

const agencyLanes: {
  agency: string;
  rows: number;
  lane: "clean" | "mixed";
  detail: string;
}[] = [
  { agency: "HHS", rows: 21652, lane: "clean", detail: "Public trust / suitability" },
  { agency: "VA", rows: 13274, lane: "clean", detail: "Public trust / suitability" },
  {
    agency: "Commerce",
    rows: 8115,
    lane: "clean",
    detail: "Census, NOAA, USPTO — all clearance-free",
  },
  { agency: "SSA", rows: 2200, lane: "clean", detail: "Public trust / suitability" },
  {
    agency: "DHS",
    rows: 12325,
    lane: "mixed",
    detail: "USCIS, FEMA generally no clearance; CBP, ICE, TSA, USSS, Coast Guard skew cleared",
  },
];

const toc = [
  { id: "competition", label: "One-bidder competition" },
  { id: "offer-traps", label: "Offer-count traps" },
  { id: "saturation", label: "Score saturation" },
  { id: "retention", label: "Who retains" },
  { id: "lanes", label: "Public-trust lanes" },
];

export default function InsightsPage() {
  const maxRetention = Math.max(...retentionBySize.map((r) => r.pct));

  return (
    <section className="max-w-4xl mx-auto">
      <div className="text-xs text-zinc-500 mb-4 mono">
        <a href="/" className="hover:text-zinc-300">radar</a>
        <span className="mx-1">/</span>
        <span className="text-zinc-100">insights</span>
      </div>

      <div className="card p-4 sm:p-6 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
            What the data actually says
          </h1>
          <span className="text-xs text-zinc-500 mono border border-[#1f1f23] rounded-md px-2 py-0.5">
            sql/analysis.sql · 2026-08-07
          </span>
        </div>
        <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
          Five findings from SQL run directly against the warehouse behind
          this app — including the ones that make the app&apos;s own scoring
          model look bad. Each is written with its caveats attached, because
          most of the interesting numbers in this dataset are wrong until
          you clean them.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 mt-6">
          <Metric label="Awards" value="57,566" note="one row per award" />
          <Metric label="Agencies" value="5" note="HHS · VA · DHS · DOC · SSA" />
          <Metric label="NAICS" value="3" note="541511 · 541512 · 518210" />
          <Metric
            label="Single-offer F&O $"
            value="$39.0"
            suffix="B"
            accent
            note="labeled full & open"
          />
        </div>

        <div className="divider my-5" />

        <nav className="flex flex-wrap gap-2 text-xs">
          {toc.map((t, i) => (
            <a
              key={t.id}
              href={`#${t.id}`}
              className="mono border border-[#1f1f23] rounded-md px-2 py-1 text-zinc-400 hover:text-zinc-300 hover:bg-[#f2ead8]"
            >
              {i + 1} · {t.label}
            </a>
          ))}
        </nav>
      </div>

      {/* 1 · Competition theater */}
      <Finding
        id="competition"
        n={1}
        title="“Full and open” competition usually draws one bidder"
        takeaway="Across every agency in scope, more than half of awards labeled FULL AND OPEN COMPETITION received exactly one offer — $39.0B where the competitive label describes the procedure, not the outcome."
        source="Query 1 · Competition theater"
      >
        <div className="space-y-3">
          {singleOfferByAgency.map((a) => (
            <div key={a.agency}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span>{a.agency}</span>
                <span className="mono text-zinc-400">{a.pct.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 bg-[#1f1f23] rounded-sm">
                <div className="h-1.5 bar-accent" style={{ width: `${a.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="text-xs text-zinc-500 mt-2">
          Share of full-and-open awards with exactly one offer · vehicle
          artifacts excluded
        </div>
        <Notes
          items={[
            "SSA is the worst offender — only visible once SSA was added to scope.",
            "The finding gets stronger after cleaning: unfiltered it reads ~6 pts lower, because the artifact rows are all high-offer.",
            "Related: unrestricted (no set-aside) work draws fewer bidders than small-business set-asides. The direction survives cleaning; the magnitude does not.",
            "Needs no scoring model — it's a straight count.",
          ]}
        />
      </Finding>

      {/* 2 · Offer-count traps */}
      <Finding
        id="offer-traps"
        n={2}
        title="Offer counts are contaminated by vehicles and sentinels"
        takeaway="number_of_offers_received will embarrass you if quoted raw. Parent IDIQ vehicles report offers on the vehicle, not the order, and at least one award type uses 999 as a placeholder. Real order-level competition is 2–3 offers."
        source="Query 0 · The offer-count trap"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Stat value="78.4" label="avg offers on blank award-type rows" note="n = 2,227" hot />
          <Stat value="47%" label="of those rows report 50+ offers" note="IDIQ / vehicle awards" hot />
          <Stat value="999" label="max offers on PURCHASE ORDER" note="an obvious sentinel" hot />
        </div>
        <div className="text-sm text-zinc-400 mt-4 leading-relaxed">
          Left in, the artifact turns a real signal into a fake one: small-business
          set-asides read <span className="mono">32.1</span> avg offers vs{" "}
          <span className="mono">6.5</span> for unrestricted — a ~10× spread
          that is almost entirely the vehicle rows. Every offer-based query
          applies the same filter:
        </div>
        <pre className="mono text-xs mt-3 p-3 rounded-md bg-[#f6f0df] border border-[#1f1f23] overflow-x-auto whitespace-pre">
{`number_of_offers_received BETWEEN 1 AND 50
AND NULLIF(contract_award_type, '')
    IS NOT NULL`}
        </pre>
      </Finding>

      {/* 3 · Score saturation */}
      <Finding
        id="saturation"
        n={3}
        title="Incumbent strength score saturates at 65"
        takeaway="54.1% of the 3,658 recompete candidates are tied at incumbent_strength = 65 — the score's structural maximum. With ties broken by dollars, the ranked radar is close to “sorted by contract size.”"
        source="Queries 3–4 · The scores don't discriminate"
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 mb-5">
          <Metric label="Tied at max" value="54.1" suffix="%" accent note="of 3,658 candidates" />
          <Metric label="Real max" value="65" note="header claims 0–100" />
          <Metric label="Over lifetime cap" value="23.9" suffix="%" note="of vendors ≥ $3.27M" />
          <Metric label="Corr. w/ offers" value="0.0145" note="n = 2,725" />
        </div>

        <TableCard>
          <thead className="text-left text-zinc-500 text-xs uppercase tracking-wider">
            <tr className="border-b border-[#1f1f23]">
              <th className="px-3 sm:px-4 py-2.5 font-medium">Component</th>
              <th className="px-3 sm:px-4 py-2.5 font-medium text-right">Cap</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#141417]">
            {strengthCaps.map((c) => (
              <tr key={c.component}>
                <td className="px-3 sm:px-4 py-3">
                  <div className="mono text-xs sm:text-sm">{c.component}</div>
                  {c.note && <div className="text-xs text-zinc-500 mt-0.5">{c.note}</div>}
                </td>
                <td className="px-3 sm:px-4 py-3 mono text-right">{c.cap}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="px-3 sm:px-4 py-3">Maximum possible</td>
              <td className="px-3 sm:px-4 py-3 mono text-right text-amber-400">65</td>
            </tr>
          </tbody>
        </TableCard>

        <Notes
          items={[
            "The lifetime term is least(30, ln(lifetime) × 2), which caps at e¹⁵ ≈ $3.27M. A $3.3M vendor and a $9.2B vendor score identically.",
            "Correlation between strength and offers received is effectively zero, and single-offer rate falls as strength rises — backwards for a defensibility score.",
            "recompete_score has the same problem: it cannot exceed 60, and the least(100, …) wrappers never bind.",
            "Saturation worsened after the scope expansion (52.5% → 54.1%) because vendor totals aggregate across NAICS.",
          ]}
        />
      </Finding>

      {/* 4 · Retention by size */}
      <Finding
        id="retention"
        n={4}
        title="Mid-size specialists retain better than giant primes"
        takeaway="The score treats bigger incumbents as stronger. The backtest says otherwise: vendors with $18.4–82.1M in-scope lifetime obligations kept their work most often, and the largest primes kept it least."
        source="Queries 5–6 · Recompete backtest & retention by size"
      >
        <TableCard>
          <thead className="text-left text-zinc-500 text-xs uppercase tracking-wider">
            <tr className="border-b border-[#1f1f23]">
              <th className="px-3 sm:px-4 py-2.5 font-medium">Lifetime $</th>
              <th className="px-3 sm:px-4 py-2.5 font-medium text-right">Retained</th>
              <th className="hidden sm:table-cell px-4 py-2.5 font-medium text-right">
                Prior run
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#141417]">
            {retentionBySize.map((r) => (
              <tr key={r.q}>
                <td className="px-3 sm:px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="mono text-xs text-zinc-500">{r.q}</span>
                    <span className="mono text-xs sm:text-sm">{r.band}</span>
                    {r.tag && (
                      <span className={`score-pill ${r.tag === "best" ? "s-str" : "s-hot"}`}>
                        {r.tag}
                      </span>
                    )}
                  </div>
                  <div
                    className={`h-1.5 mt-2 ${r.tag === "best" ? "bar-accent" : "bar"}`}
                    style={{ width: `${(r.pct / maxRetention) * 100}%` }}
                  />
                </td>
                <td className="px-3 sm:px-4 py-3 mono text-right align-top">
                  {r.pct.toFixed(1)}%
                  <div className="sm:hidden text-xs text-zinc-500 mt-0.5">
                    prior {r.prior.toFixed(1)}%
                  </div>
                </td>
                <td className="hidden sm:table-cell px-4 py-3 mono text-right text-zinc-500 align-top">
                  {r.prior.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </TableCard>
        <div className="text-xs text-zinc-500 mt-2">
          Incumbent retention by vendor lifetime-obligation quintile · n = 2,079
          per quintile · prior run: 3 agencies × 2 NAICS, n = 1,351
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          <Stat value="30.1%" label="retained in near window" note="−180d to +365d, n = 10,393" />
          <Stat value="11.3%" label="retained in placebo window" note="+3y to +5y, n = 3,687" />
        </div>

        <Notes
          items={[
            "Replicated: same shape — peak at Q2, trough at Q5 — before and after a 54% data increase. That survival is the strongest evidence here.",
            "Successors are inferred (same office + PSC, closest in dollars). The 2.7× lift over placebo shows the match captures something real, but treat the level as soft.",
            "Look-ahead bias: lifetime obligations are as-of-today, not as-of-contract-end. Read the ordering as the finding, not the exact percentages.",
          ]}
        />
      </Finding>

      {/* 5 · Clearance lanes */}
      <Finding
        id="lanes"
        n={5}
        title="HHS, VA, SSA and Commerce are clean public-trust lanes; DHS is mixed"
        takeaway="Clearance requirements decide who can realistically compete — and who can be hired. Four of the five agencies are essentially all public-trust work. DHS has to be split by component."
        source="Scope notes · Query 7 clearance filter"
      >
        <TableCard>
          <thead className="text-left text-zinc-500 text-xs uppercase tracking-wider">
            <tr className="border-b border-[#1f1f23]">
              <th className="px-3 sm:px-4 py-2.5 font-medium">Agency</th>
              <th className="px-3 sm:px-4 py-2.5 font-medium">Lane</th>
              <th className="hidden sm:table-cell px-4 py-2.5 font-medium text-right">
                Awards
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#141417]">
            {agencyLanes.map((a) => (
              <tr key={a.agency}>
                <td className="px-3 sm:px-4 py-3 align-top">
                  <div className="font-medium">{a.agency}</div>
                  <div className="sm:hidden mono text-xs text-zinc-500 mt-0.5">
                    {a.rows.toLocaleString()} awards
                  </div>
                </td>
                <td className="px-3 sm:px-4 py-3 align-top">
                  <span className={`score-pill ${a.lane === "clean" ? "s-str" : "s-hi"}`}>
                    {a.lane === "clean" ? "public trust" : "mixed"}
                  </span>
                  <div className="text-xs text-zinc-500 mt-1">{a.detail}</div>
                </td>
                <td className="hidden sm:table-cell px-4 py-3 mono text-right align-top">
                  {a.rows.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </TableCard>
        <Notes
          items={[
            "Commerce is pulled whole because the API filters by top-tier agency only — it brings in Census, NOAA and USPTO, all clearance-free.",
            "Applying the DHS split (keep USCIS and FEMA, drop CBP, ICE, TSA, USSS, Coast Guard) removed four previously-surfaced firms whose work was unreachable without a clearance.",
          ]}
        />
      </Finding>

      <div className="card p-4 sm:p-5">
        <div className="text-sm font-medium mb-2">What this data can&apos;t tell you</div>
        <ul className="text-sm text-zinc-400 space-y-2 leading-relaxed list-disc pl-5">
          <li>
            It&apos;s one row per award (USASpending prime award summaries) — there
            is no modification history.
          </li>
          <li>
            Coverage is effectively all-time (POP start 1996–2026); the fiscal-year
            column is a partition label, not a filter.
          </li>
          <li>
            Lifetime obligations are scope-limited to 5 agencies × 3 NAICS, not
            company size, and vendor entity resolution is unfinished.
          </li>
          <li>Nothing here generalizes to federal contracting as a whole.</li>
        </ul>
      </div>
    </section>
  );
}

function Finding({
  id,
  n,
  title,
  takeaway,
  source,
  children,
}: {
  id: string;
  n: number;
  title: string;
  takeaway: string;
  source: string;
  children: React.ReactNode;
}) {
  return (
    <article id={id} className="card p-4 sm:p-6 mb-4 scroll-mt-20">
      <div className="flex items-center gap-2 text-xs text-zinc-500 mono mb-2">
        <span className="kbd">{String(n).padStart(2, "0")}</span>
        <span>{source}</span>
      </div>
      <h2 className="text-lg sm:text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 mb-5 text-sm sm:text-base text-zinc-400 leading-relaxed">
        {takeaway}
      </p>
      {children}
    </article>
  );
}

function TableCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-[#1f1f23] rounded-lg overflow-x-auto">
      <table className="w-full text-sm row-hover">{children}</table>
    </div>
  );
}

function Notes({ items }: { items: string[] }) {
  return (
    <ul className="mt-5 space-y-2 text-sm text-zinc-400 leading-relaxed">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="text-amber-400 shrink-0" aria-hidden>
            ›
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Stat({
  value,
  label,
  note,
  hot,
}: {
  value: string;
  label: string;
  note: string;
  hot?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[#1f1f23] bg-[#f6f0df] p-3">
      <div className={`mono text-xl font-semibold ${hot ? "text-rose-400" : ""}`}>
        {value}
      </div>
      <div className="text-sm mt-0.5">{label}</div>
      <div className="text-xs text-zinc-500 mt-0.5">{note}</div>
    </div>
  );
}

function Metric({
  label,
  value,
  suffix,
  note,
  accent,
}: {
  label: string;
  value: string;
  suffix?: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-zinc-500 uppercase tracking-wider">{label}</div>
      <div
        className={`mono text-xl sm:text-2xl font-semibold mt-1 ${
          accent ? "text-amber-400" : ""
        }`}
      >
        {value}
        {suffix && <span className="text-zinc-500 text-base sm:text-lg">{suffix}</span>}
      </div>
      <div className="text-xs text-zinc-500 mt-0.5">{note}</div>
    </div>
  );
}
