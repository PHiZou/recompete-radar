import { notFound } from "next/navigation";
import ScorePill, { scoreTone } from "@/components/score-pill";

const fmtM = (m: number | null | undefined) =>
  m == null ? "—" : Math.abs(m) >= 1 ? `$${m.toFixed(2)}M` : `$${(m * 1000).toFixed(0)}K`;

const fmtSignedM = (m: number) => {
  const s = m >= 0 ? "+" : "−";
  const abs = Math.abs(m);
  return `${s}${abs >= 1 ? `$${abs.toFixed(2)}M` : `$${(abs * 1000).toFixed(0)}K`}`;
};

type Modification = {
  action_date: string;
  modification_number: string;
  action_type: string;
  description: string;
  obligation_delta: number;
  cumulative_obligated: number;
  pop_end_as_of: string | null;
};

type Breakdown = {
  pop_window_pts: number;
  definitive_pts: number;
  above_median_pts: number;
  lifetime_pts: number;
  breadth_pts: number;
  recency_pts: number;
};

type ContractDetail = {
  piid: string;
  parent_piid: string | null;
  title: string;
  awarding_agency_name: string;
  awarding_sub_agency_name: string;
  awarding_office_name: string | null;
  naics_code: string;
  naics_description: string;
  psc_code: string | null;
  psc_description: string | null;
  contract_award_type: string | null;
  type_of_contract_pricing: string | null;
  type_of_set_aside: string | null;
  extent_competed: string | null;
  incumbent_name: string;
  incumbent_uei: string | null;
  pop_start_date: string | null;
  pop_current_end_date: string | null;
  months_to_pop_end: number | null;
  total_obligated_millions: number;
  base_and_all_options_millions: number | null;
  recompete_score: number | null;
  incumbent_strength: number | null;
  breakdown: Breakdown | null;
  modification_count: number;
  modifications: Modification[];
};

const COLLAPSE_AFTER = 10;

async function fetchContract(piid: string): Promise<ContractDetail | null> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const res = await fetch(`${base}/contracts/${encodeURIComponent(piid)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as ContractDetail;
}

export default async function ContractPage({
  params,
  searchParams,
}: {
  params: { piid: string };
  searchParams: { all?: string };
}) {
  const piid = decodeURIComponent(params.piid);
  const c = await fetchContract(piid);
  if (!c) notFound();

  const showAll = searchParams.all === "1";
  const mods = showAll ? c.modifications : c.modifications.slice(-COLLAPSE_AFTER).reverse();
  const hidden = c.modifications.length - mods.length;

  return (
    <section>
      <div className="text-xs text-zinc-500 mb-4 mono">
        <a href="/" className="hover:text-zinc-300">radar</a>
        <span className="mx-1">/</span>
        <span>contracts</span>
        <span className="mx-1">/</span>
        <span className="text-zinc-100">{c.piid}</span>
      </div>

      <div className="card p-6 mb-4">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight">{c.title}</h1>
              <span className="text-xs text-zinc-500 mono border border-[#1f1f23] rounded-md px-2 py-0.5">
                PIID · {c.piid}
              </span>
              {c.parent_piid && (
                <span className="text-xs text-zinc-500 mono border border-[#1f1f23] rounded-md px-2 py-0.5">
                  parent · {c.parent_piid}
                </span>
              )}
            </div>
            <div className="mt-1 text-sm text-zinc-500">
              {c.awarding_sub_agency_name} · {c.awarding_agency_name}
              {c.awarding_office_name && <> · {c.awarding_office_name}</>}
            </div>
          </div>
          {c.recompete_score != null && (
            <div className="flex gap-3 shrink-0">
              <div className="text-right">
                <div className="text-xs text-zinc-500 uppercase tracking-wider">Recompete</div>
                <div className="mt-1">
                  <ScorePill value={c.recompete_score} tone={scoreTone(c.recompete_score)} />
                </div>
              </div>
              {c.incumbent_strength != null && (
                <div className="text-right">
                  <div className="text-xs text-zinc-500 uppercase tracking-wider">Incumbent</div>
                  <div className="mt-1">
                    <ScorePill value={c.incumbent_strength} tone={scoreTone(c.incumbent_strength)} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6">
          <Field label="Incumbent" value={
            c.incumbent_uei ? (
              <a href={`/vendors/${c.incumbent_uei}`} className="text-amber-400 hover:underline">
                {c.incumbent_name}
              </a>
            ) : c.incumbent_name
          } />
          <Field label="NAICS" value={<span className="mono">{c.naics_code}</span>} note={c.naics_description} />
          <Field label="PSC" value={c.psc_code ? <span className="mono">{c.psc_code}</span> : "—"} note={c.psc_description ?? undefined} />
          <Field label="Set-aside" value={c.type_of_set_aside ?? "—"} note={c.extent_competed ?? undefined} />
          <Field label="POP start" value={<span className="mono">{c.pop_start_date ?? "—"}</span>} />
          <Field label="POP end" value={<span className="mono">{c.pop_current_end_date ?? "—"}</span>}
            note={c.months_to_pop_end != null ? `${c.months_to_pop_end} mo out` : undefined} />
          <Field label="Obligated to date" value={<span className="mono">{fmtM(c.total_obligated_millions)}</span>} />
          <Field label="Base + all options" value={<span className="mono">{fmtM(c.base_and_all_options_millions)}</span>}
            note={c.contract_award_type ?? undefined} />
        </div>
      </div>

      {c.breakdown && c.recompete_score != null && (
        <div className="card p-5 mb-4">
          <div className="text-sm font-medium mb-3">Score breakdown</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <BreakdownRow label="POP window" value={c.breakdown.pop_window_pts} max={30} />
            <BreakdownRow label="Definitive contract" value={c.breakdown.definitive_pts} max={15} />
            <BreakdownRow label="Above-median value" value={c.breakdown.above_median_pts} max={15} />
            <BreakdownRow label="Incumbent · lifetime $" value={c.breakdown.lifetime_pts} max={30} />
            <BreakdownRow label="Incumbent · breadth" value={c.breakdown.breadth_pts} max={15} />
            <BreakdownRow label="Incumbent · recency" value={c.breakdown.recency_pts} max={20} />
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f1f23]">
          <div className="text-sm font-medium">
            Modification history
          </div>
          <div className="text-xs text-zinc-500">
            {c.modification_count} action{c.modification_count === 1 ? "" : "s"}
            {!showAll && hidden > 0 && (
              <> · showing latest {mods.length} · <a href="?all=1" className="text-amber-400 hover:underline">show all</a></>
            )}
            {showAll && c.modification_count > COLLAPSE_AFTER && (
              <> · <a href="?" className="text-amber-400 hover:underline">collapse</a></>
            )}
          </div>
        </div>
        {mods.length === 0 ? (
          <div className="px-4 py-8 text-sm text-zinc-500">No modifications loaded.</div>
        ) : (
          <table className="w-full text-sm row-hover">
            <thead className="text-left text-zinc-500 text-xs uppercase tracking-wider">
              <tr className="border-b border-[#1f1f23]">
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Mod #</th>
                <th className="px-4 py-2.5 font-medium">Action</th>
                <th className="px-4 py-2.5 font-medium text-right">Δ obligated</th>
                <th className="px-4 py-2.5 font-medium text-right">Cumulative</th>
                <th className="px-4 py-2.5 font-medium mono">POP end as-of</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141417]">
              {mods.map((m, i) => (
                <tr key={`${m.action_date}-${m.modification_number}-${i}`}>
                  <td className="px-4 py-3 mono text-zinc-300">{m.action_date}</td>
                  <td className="px-4 py-3 mono text-zinc-400">{m.modification_number || "—"}</td>
                  <td className="px-4 py-3 text-zinc-300">
                    <div>{m.action_type || "—"}</div>
                    {m.description && (
                      <div className="text-xs text-zinc-500 truncate max-w-md" title={m.description}>
                        {m.description}
                      </div>
                    )}
                  </td>
                  <td className={`px-4 py-3 mono text-right ${m.obligation_delta < 0 ? "text-rose-400" : m.obligation_delta > 0 ? "text-emerald-400" : "text-zinc-500"}`}>
                    {m.obligation_delta === 0 ? "$0" : fmtSignedM(m.obligation_delta)}
                  </td>
                  <td className="px-4 py-3 mono text-right text-zinc-300">
                    {fmtM(m.cumulative_obligated)}
                  </td>
                  <td className="px-4 py-3 mono text-zinc-400">{m.pop_end_as_of ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 text-xs text-zinc-500 mono">
        Source · USASpending Custom Award API · DHS slice · NAICS 541511/541512 · obligations FY2020+.
      </div>
    </section>
  );
}

function Field({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-medium mt-1">{value}</div>
      {note && <div className="text-xs text-zinc-500 mt-0.5 truncate" title={note}>{note}</div>}
    </div>
  );
}

function BreakdownRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
        <span>{label}</span>
        <span className="mono">
          <span className="text-zinc-100">{value}</span>
          <span className="text-zinc-500"> / {max}</span>
        </span>
      </div>
      <div className="h-1.5 rounded bg-[#1f1f23] overflow-hidden">
        <div className="h-full bar-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
