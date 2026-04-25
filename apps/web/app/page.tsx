import ScorePill, { scoreTone } from "@/components/score-pill";
import {
  recompeteCandidates as mockCandidates,
  radarSummary,
  type RecompeteCandidate,
} from "@/lib/mock-data";

const fmtM = (m: number) =>
  m >= 1000 ? `$${(m / 1000).toFixed(2)}B` : `$${m.toFixed(1)}M`;

async function fetchRecompetes(): Promise<RecompeteCandidate[]> {
  try {
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const res = await fetch(`${base}/recompetes?limit=20`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!Array.isArray(data) || data.length === 0) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.map((r: any) => ({
      piid: r.piid,
      naics: r.naics,
      title: r.title,
      subAgency: r.sub_agency,
      incumbent: r.incumbent,
      popEnd: r.pop_end,
      monthsToPopEnd: r.months_to_pop_end,
      valueMillions: r.value_millions,
      recompeteScore: r.recompete_score,
      incumbentStrength: r.incumbent_strength,
    }));
  } catch {
    return [];
  }
}

export default async function RadarPage() {
  const liveRows = await fetchRecompetes();
  const recompeteCandidates =
    liveRows.length > 0 ? liveRows : mockCandidates;
  return (
    <section>
      {/* Filter row */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <FilterChip label="Agency" value="Department of Homeland Security" expandable />
        <FilterChip label="NAICS" value="541511, 541512" mono expandable />
        <FilterChip label="POP ends within" value="12 months" expandable />
        <FilterChip label="Min score" value="60" mono />
        <div className="ml-auto flex items-center gap-2">
          <button className="px-3 h-9 card text-sm text-zinc-400 hover:text-zinc-100">
            Export CSV
          </button>
          <button className="px-3 h-9 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400">
            Save view
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <KpiCard
          label="Candidates"
          value={`${radarSummary.candidates}`}
          note="↑ 12 vs prior 12mo"
        />
        <KpiCard
          label="$ at stake"
          value={`$${radarSummary.dollarsAtStakeBillions.toFixed(2)}`}
          suffix="B"
          note="obligated, base + options"
        />
        <KpiCard
          label="Top incumbent"
          rawValue={
            <span className="text-xl font-semibold">
              {radarSummary.topIncumbent.name}
            </span>
          }
          note={`$${radarSummary.topIncumbent.dollarsBillions}B across ${radarSummary.topIncumbent.awards} awards`}
        />
        <KpiCard
          label="Market HHI"
          value={`${radarSummary.marketHhi}`}
          noteEl={
            <span className="text-emerald-400">
              low concentration · competitive
            </span>
          }
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f1f23]">
          <div className="text-sm text-zinc-400">
            Recompete candidates · sorted by{" "}
            <span className="text-zinc-100">recompete score</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span>{radarSummary.candidates} rows</span>
            <span>·</span>
            <span>updated 2026-04-21</span>
          </div>
        </div>
        <table className="w-full text-sm row-hover">
          <thead className="text-left text-zinc-500 text-xs uppercase tracking-wider">
            <tr className="border-b border-[#1f1f23]">
              <th className="px-4 py-2.5 font-medium">Contract</th>
              <th className="px-4 py-2.5 font-medium">Sub-agency</th>
              <th className="px-4 py-2.5 font-medium">Incumbent</th>
              <th className="px-4 py-2.5 font-medium">POP end</th>
              <th className="px-4 py-2.5 font-medium text-right">Value</th>
              <th className="px-4 py-2.5 font-medium text-right">Recompete</th>
              <th className="px-4 py-2.5 font-medium text-right">
                Incumbent str.
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#141417]">
            {recompeteCandidates.map((r) => (
              <tr key={r.piid} className="cursor-pointer">
                <td className="px-4 py-3">
                  <div className="font-medium">{r.title}</div>
                  <div className="mono text-xs text-zinc-500">
                    {r.piid} · {r.naics}
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-300">{r.subAgency}</td>
                <td className="px-4 py-3">{r.incumbent}</td>
                <td className="px-4 py-3 mono text-zinc-300">
                  {r.popEnd}{" "}
                  <span className="text-zinc-500 text-xs">
                    · {r.monthsToPopEnd}mo
                  </span>
                </td>
                <td className="px-4 py-3 mono text-right">
                  {fmtM(r.valueMillions)}
                </td>
                <td className="px-4 py-3 text-right">
                  <ScorePill
                    value={r.recompeteScore}
                    tone={scoreTone(r.recompeteScore)}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <ScorePill
                    value={r.incumbentStrength}
                    tone={
                      r.incumbentStrength >= 80
                        ? "str"
                        : r.incumbentStrength >= 60
                        ? "mid"
                        : "lo"
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#1f1f23] text-xs text-zinc-500">
          <span>
            Showing {recompeteCandidates.length} of {radarSummary.candidates} ·
            click any row for score breakdown
          </span>
          <span className="mono">1 / 5 →</span>
        </div>
      </div>

      {/* Score explainer */}
      <div className="mt-5 card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-wider">
              Drawer preview · row click
            </div>
            <div className="text-base font-medium mt-0.5">
              Why recompete score is{" "}
              <span className="mono text-amber-400">94</span> — FEMA Mission
              Support Services
            </div>
          </div>
          <span className="text-xs text-zinc-500 mono">
            every score is decomposed — no black box
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <ScoreRow label="POP ends within 12 months" delta="+30" />
          <ScoreRow
            label="Contract type is definitive (single-award BPA call)"
            delta="+15"
          />
          <ScoreRow
            label="FEMA historically recompetes 541512 (72% over 10yr)"
            delta="+20"
          />
          <ScoreRow label="Value > FEMA median for NAICS ($42M)" delta="+15" />
          <ScoreRow label="No POP-extending mods in last 12mo" delta="+15" />
          <ScoreRow
            label="Set-aside status changed (SB → unrestricted)"
            delta="−1"
            muted
          />
        </div>
        <div className="divider my-4" />
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-500">Total · capped at 100</span>
          <span className="mono font-semibold text-amber-400 text-lg">94</span>
        </div>
      </div>
    </section>
  );
}

function FilterChip({
  label,
  value,
  mono,
  expandable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  expandable?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 h-9 card text-sm">
      <span className="text-zinc-500 text-xs uppercase tracking-wider">
        {label}
      </span>
      <span className={`font-medium ${mono ? "mono" : ""}`}>{value}</span>
      {expandable && (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#71717a"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  suffix,
  note,
  noteEl,
  rawValue,
}: {
  label: string;
  value?: string;
  suffix?: string;
  note?: string;
  noteEl?: React.ReactNode;
  rawValue?: React.ReactNode;
}) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs text-zinc-500 uppercase tracking-wider">
        {label}
      </div>
      {rawValue ? (
        <div className="mt-1">{rawValue}</div>
      ) : (
        <div className="mono text-2xl font-semibold mt-1">
          {value}
          {suffix && (
            <span className="text-zinc-500 text-lg">{suffix}</span>
          )}
        </div>
      )}
      <div className="text-xs text-zinc-500 mt-1">{noteEl ?? note}</div>
    </div>
  );
}

function ScoreRow({
  label,
  delta,
  muted,
}: {
  label: string;
  delta: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-400">{label}</span>
      <span
        className={
          "mono " + (muted ? "text-zinc-500" : "text-emerald-400")
        }
      >
        {delta}
      </span>
    </div>
  );
}
