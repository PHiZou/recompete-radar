import ScorePill, { scoreTone } from "@/components/score-pill";
import {
  recompeteCandidates as mockCandidates,
  radarSummary as mockSummary,
  type RecompeteCandidate,
} from "@/lib/mock-data";

const fmtM = (m: number) =>
  m >= 1000 ? `$${(m / 1000).toFixed(2)}B` : `$${m.toFixed(1)}M`;

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type ApiSubAgency = { code: string; name: string; candidate_count: number };
type ApiSummary = {
  candidates: number;
  dollars_at_stake_millions: number;
  top_incumbent: {
    name: string;
    uei: string | null;
    obligated_millions: number;
    award_count: number;
  } | null;
  sub_agency_filter: string | null;
};

async function fetchJSON<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchRecompetes(qs: string): Promise<RecompeteCandidate[]> {
  const data = await fetchJSON<unknown[]>(`/recompetes?${qs}`);
  if (!Array.isArray(data) || data.length === 0) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.map((r: any) => ({
    piid: r.piid,
    naics: r.naics,
    title: r.title,
    subAgency: r.sub_agency,
    incumbent: r.incumbent,
    incumbentUei: r.incumbent_uei ?? null,
    breakdown: r.breakdown
      ? {
          popWindowPts: r.breakdown.pop_window_pts,
          definitivePts: r.breakdown.definitive_pts,
          aboveMedianPts: r.breakdown.above_median_pts,
          lifetimePts: r.breakdown.lifetime_pts,
          breadthPts: r.breakdown.breadth_pts,
          recencyPts: r.breakdown.recency_pts,
        }
      : undefined,
    popEnd: r.pop_end,
    monthsToPopEnd: r.months_to_pop_end,
    valueMillions: r.value_millions,
    recompeteScore: r.recompete_score,
    incumbentStrength: r.incumbent_strength,
  }));
}

export default async function RadarPage({
  searchParams,
}: {
  searchParams: { subAgency?: string; maxMonths?: string; minScore?: string };
}) {
  const subAgency = searchParams.subAgency ?? "";
  const maxMonths = searchParams.maxMonths ?? "36";
  const minScore = searchParams.minScore ?? "0";

  const params = new URLSearchParams();
  if (subAgency) params.set("sub_agency_code", subAgency);
  params.set("max_months", maxMonths);
  params.set("min_score", minScore);
  params.set("limit", "100");
  const qs = params.toString();

  const [liveRows, liveSummary, subAgencies] = await Promise.all([
    fetchRecompetes(qs),
    fetchJSON<ApiSummary>(`/summary?${qs}`),
    fetchJSON<ApiSubAgency[]>(`/sub_agencies`),
  ]);

  const isLive = liveRows.length > 0;
  const recompeteCandidates = isLive ? liveRows : mockCandidates;

  // KPI strip values — live when we have them, else mock
  const kpiCandidates = liveSummary?.candidates ?? mockSummary.candidates;
  const kpiAtStakeM =
    liveSummary?.dollars_at_stake_millions ??
    mockSummary.dollarsAtStakeBillions * 1000;
  const kpiTopIncumbent = liveSummary?.top_incumbent ?? null;
  const activeSubAgencyCount = (subAgencies ?? []).length;

  const subAgencyName =
    (subAgencies ?? []).find((s) => s.code === subAgency)?.name ?? null;

  return (
    <section>
      {/* Filter row — real GET form */}
      <form
        method="GET"
        action="/"
        className="flex items-center gap-3 mb-5 flex-wrap"
      >
        <FilterSelect
          name="subAgency"
          label="Sub-agency"
          value={subAgency}
          options={[
            { value: "", label: "All DHS sub-agencies" },
            ...((subAgencies ?? []).map((s) => ({
              value: s.code,
              label: `${s.name} (${s.candidate_count})`,
            }))),
          ]}
        />
        <FilterSelect
          name="maxMonths"
          label="POP ends within"
          value={maxMonths}
          options={[
            { value: "6", label: "6 months" },
            { value: "12", label: "12 months" },
            { value: "24", label: "24 months" },
            { value: "36", label: "36 months" },
          ]}
        />
        <FilterSelect
          name="minScore"
          label="Min score"
          value={minScore}
          mono
          options={[
            { value: "0", label: "0" },
            { value: "30", label: "30" },
            { value: "50", label: "50" },
            { value: "60", label: "60" },
          ]}
        />
        <button
          type="submit"
          className="px-3 h-9 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400"
        >
          Apply
        </button>
        {(subAgency || maxMonths !== "36" || minScore !== "0") && (
          <a
            href="/"
            className="px-3 h-9 inline-flex items-center text-sm text-zinc-500 hover:text-zinc-300"
          >
            Reset
          </a>
        )}
      </form>

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <KpiCard
          label="Candidates"
          value={`${kpiCandidates}`}
          note={
            subAgencyName
              ? `filter: ${subAgencyName}`
              : `${activeSubAgencyCount} sub-agencies represented`
          }
        />
        <KpiCard
          label="$ at stake"
          value={`$${(kpiAtStakeM / 1000).toFixed(2)}`}
          suffix="B"
          note="obligated, active POP-end window"
        />
        <KpiCard
          label="Top incumbent"
          rawValue={
            kpiTopIncumbent ? (
              kpiTopIncumbent.uei ? (
                <a
                  href={`/vendors/${kpiTopIncumbent.uei}`}
                  className="text-base font-semibold hover:text-amber-400"
                >
                  {kpiTopIncumbent.name}
                </a>
              ) : (
                <span className="text-base font-semibold">
                  {kpiTopIncumbent.name}
                </span>
              )
            ) : (
              <span className="text-zinc-500 text-sm">—</span>
            )
          }
          note={
            kpiTopIncumbent
              ? `${fmtM(kpiTopIncumbent.obligated_millions)} across ${kpiTopIncumbent.award_count} candidates`
              : "no incumbent data"
          }
        />
        <KpiCard
          label="Slice"
          rawValue={
            <span className="text-base font-semibold mono">
              DHS · 541511/541512
            </span>
          }
          note="MVP scope · widens in Phase 2"
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
            <span>{recompeteCandidates.length} rows</span>
            {!isLive && (
              <span className="text-amber-500">· mock data (API offline)</span>
            )}
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
                <td className="px-4 py-3">
                  {r.incumbentUei ? (
                    <a
                      href={`/vendors/${r.incumbentUei}`}
                      className="hover:text-amber-400 hover:underline"
                    >
                      {r.incumbent}
                    </a>
                  ) : (
                    r.incumbent
                  )}
                </td>
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
      </div>

      {/* Score explainer — driven by the top live candidate */}
      {recompeteCandidates[0]?.breakdown && (() => {
        const top = recompeteCandidates[0];
        const b = top.breakdown!;
        const rows: { label: string; delta: number }[] = [
          {
            label: `POP ends in ${top.monthsToPopEnd} months`,
            delta: b.popWindowPts,
          },
          {
            label: "Contract type is definitive (vs. IDV/order)",
            delta: b.definitivePts,
          },
          {
            label: "Value above (sub-agency, NAICS) median",
            delta: b.aboveMedianPts,
          },
          {
            label: "Incumbent: log-scaled lifetime obligations in slice",
            delta: b.lifetimePts,
          },
          {
            label: "Incumbent: breadth (distinct awards in slice)",
            delta: b.breadthPts,
          },
          {
            label: "Incumbent: recency of last action",
            delta: b.recencyPts,
          },
        ];
        return (
          <div className="mt-5 card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider">
                  Top candidate · score breakdown
                </div>
                <div className="text-base font-medium mt-0.5">
                  Why recompete score is{" "}
                  <span className="mono text-amber-400">
                    {top.recompeteScore}
                  </span>{" "}
                  — {top.incumbent} · {top.subAgency}
                </div>
              </div>
              <span className="text-xs text-zinc-500 mono">
                every score is decomposed — no black box
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              {rows.map((r) => (
                <ScoreRow
                  key={r.label}
                  label={r.label}
                  delta={r.delta > 0 ? `+${r.delta}` : `${r.delta}`}
                  muted={r.delta === 0}
                />
              ))}
            </div>
            <div className="divider my-4" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">
                Recompete · {b.popWindowPts + b.definitivePts + b.aboveMedianPts}
                {"  "}·{"  "}
                Incumbent · {b.lifetimePts + b.breadthPts + b.recencyPts}
              </span>
              <span className="mono font-semibold text-amber-400 text-lg">
                {top.recompeteScore} / {top.incumbentStrength}
              </span>
            </div>
          </div>
        );
      })()}
    </section>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
  mono,
}: {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  mono?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 px-3 h-9 card text-sm">
      <span className="text-zinc-500 text-xs uppercase tracking-wider">
        {label}
      </span>
      <select
        name={name}
        defaultValue={value}
        className={`bg-transparent outline-none font-medium ${mono ? "mono" : ""}`}
      >
        {options.map((o) => (
          <option
            key={o.value}
            value={o.value}
            className="bg-[#0a0a0c] text-zinc-100"
          >
            {o.label}
          </option>
        ))}
      </select>
    </label>
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
