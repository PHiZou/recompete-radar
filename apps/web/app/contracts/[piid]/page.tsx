import { notFound } from "next/navigation";
import ScorePill, { scoreTone } from "@/components/score-pill";
import ScoreFactors, { type ScoreBreakdown } from "@/components/score-factors";
import { contractHref, contractHrefByKey } from "@/lib/contract-href";

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

type ContractDetail = {
  piid: string;
  parent_piid: string | null;
  award_unique_key: string;
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
  breakdown: ScoreBreakdown | null;
  modification_count: number;
  modifications: Modification[];
};

const COLLAPSE_AFTER = 10;

// One row of the API's HTTP 300 body: an award that shares this PIID.
type ContractMatch = {
  parent_piid: string | null;
  award_unique_key: string;
  incumbent_name: string;
  incumbent_uei: string | null;
  awarding_sub_agency_name: string;
  pop_current_end_date: string | null;
  total_obligated_millions: number;
};

type Ambiguous = { piid: string; matches: ContractMatch[] };

type ContractResult =
  | { kind: "ok"; contract: ContractDetail }
  | { kind: "ambiguous"; body: Ambiguous }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

// Task-order PIIDs are only unique within their parent IDV, so the API
// narrows by parent_piid / award_unique_key and answers 300 when a bare PIID
// still names more than one award.
async function fetchContract(piid: string, identity: URLSearchParams): Promise<ContractResult> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const qs = identity.toString();
  let res: Response;
  try {
    res = await fetch(`${base}/contracts/${encodeURIComponent(piid)}${qs ? `?${qs}` : ""}`, {
      cache: "no-store",
    });
  } catch {
    return { kind: "error", message: "The Sunlight API could not be reached." };
  }
  if (res.status === 404) return { kind: "not_found" };
  try {
    if (res.status === 300) {
      const body = (await res.json()) as Ambiguous;
      if (Array.isArray(body?.matches)) return { kind: "ambiguous", body };
      return { kind: "error", message: "The API returned an unreadable list of matches." };
    }
    if (!res.ok) {
      return { kind: "error", message: `The API returned HTTP ${res.status}.` };
    }
    return { kind: "ok", contract: (await res.json()) as ContractDetail };
  } catch {
    return { kind: "error", message: `The API returned an unreadable response (HTTP ${res.status}).` };
  }
}

export default async function ContractPage({
  params,
  searchParams,
}: {
  params: { piid: string };
  searchParams: { all?: string; parent_piid?: string; award_unique_key?: string };
}) {
  const piid = decodeURIComponent(params.piid);
  const identity = new URLSearchParams();
  if (searchParams.parent_piid) identity.set("parent_piid", searchParams.parent_piid);
  if (searchParams.award_unique_key) identity.set("award_unique_key", searchParams.award_unique_key);

  const result = await fetchContract(piid, identity);
  if (result.kind === "not_found") notFound();
  if (result.kind === "error") return <ContractError piid={piid} message={result.message} />;
  if (result.kind === "ambiguous") return <ContractPicker piid={piid} body={result.body} />;
  const c = result.contract;

  // "show all" / "collapse" must keep the identity params, or the page would
  // fall back to the bare PIID and land on the picker.
  const withAll = new URLSearchParams(identity);
  withAll.set("all", "1");
  const allHref = `?${withAll.toString()}`;
  const collapseHref = `?${identity.toString()}`;

  const showAll = searchParams.all === "1";
  const mods = showAll ? c.modifications : c.modifications.slice(-COLLAPSE_AFTER).reverse();
  const hidden = c.modifications.length - mods.length;

  return (
    <section>
      <Breadcrumb piid={c.piid} />

      <div className="card p-4 sm:p-6 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
                {c.title}
              </h1>
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
              <div className="sm:text-right">
                <div className="text-xs text-zinc-500 uppercase tracking-wider">Recompete</div>
                <div className="mt-1">
                  <ScorePill value={c.recompete_score} tone={scoreTone(c.recompete_score)} />
                </div>
              </div>
              {c.incumbent_strength != null && (
                <div className="sm:text-right">
                  <div className="text-xs text-zinc-500 uppercase tracking-wider">Incumbent</div>
                  <div className="mt-1">
                    <ScorePill value={c.incumbent_strength} tone={c.incumbent_strength >= 80 ? "str" : c.incumbent_strength >= 60 ? "mid" : "lo"} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mt-6">
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

      {c.breakdown?.factors && c.recompete_score != null && (
        <div className="card p-5 mb-4">
          <div className="text-sm font-medium mb-3">Score breakdown</div>
          <ScoreFactors breakdown={c.breakdown} />
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-4 py-3 border-b border-[#1f1f23]">
          <div className="text-sm font-medium">
            Modification history
          </div>
          <div className="text-xs text-zinc-500">
            {c.modification_count} action{c.modification_count === 1 ? "" : "s"}
            {!showAll && hidden > 0 && (
              <> · showing latest {mods.length} · <a href={allHref} className="text-amber-400 hover:underline">show all</a></>
            )}
            {showAll && c.modification_count > COLLAPSE_AFTER && (
              <> · <a href={collapseHref} className="text-amber-400 hover:underline">collapse</a></>
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
        Source · USASpending award summaries.
      </div>
    </section>
  );
}

function Breadcrumb({ piid }: { piid: string }) {
  return (
    <div className="text-xs text-zinc-500 mb-4 mono">
      <a href="/" className="hover:text-zinc-300">radar</a>
      <span className="mx-1">/</span>
      <span>contracts</span>
      <span className="mx-1">/</span>
      <span className="text-zinc-100">{piid}</span>
    </div>
  );
}

function ContractError({ piid, message }: { piid: string; message: string }) {
  return (
    <section>
      <Breadcrumb piid={piid} />
      <div className="card p-4 sm:p-6">
        <h1 className="text-xl font-semibold tracking-tight">
          Couldn&apos;t load contract <span className="mono">{piid}</span>
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          {message} This is an error on our side, not a missing contract. Try again shortly.
        </p>
      </div>
    </section>
  );
}

function ContractPicker({ piid, body }: { piid: string; body: Ambiguous }) {
  const matches = body.matches;
  // Link by parent when that parent is unique among the matches; otherwise
  // (a shared or missing parent) link by the exact award key.
  const parentCounts = new Map<string, number>();
  for (const m of matches) {
    if (m.parent_piid) parentCounts.set(m.parent_piid, (parentCounts.get(m.parent_piid) ?? 0) + 1);
  }
  const hrefFor = (m: ContractMatch) =>
    m.parent_piid && parentCounts.get(m.parent_piid) === 1
      ? contractHref(piid, m.parent_piid)
      : contractHrefByKey(piid, m.award_unique_key);

  return (
    <section>
      <Breadcrumb piid={piid} />
      <div className="card p-4 sm:p-6 mb-4">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
          <span className="mono">{piid}</span> is used by {matches.length} task orders under
          different vehicles; pick one
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Task-order numbers are only unique within their parent contract vehicle (IDV), so
          this PIID alone doesn&apos;t identify one award.
        </p>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm row-hover">
          <thead className="text-left text-zinc-500 text-xs uppercase tracking-wider">
            <tr className="border-b border-[#1f1f23]">
              <th className="px-4 py-2.5 font-medium">Parent IDV</th>
              <th className="px-4 py-2.5 font-medium">Incumbent</th>
              <th className="px-4 py-2.5 font-medium">Sub-agency</th>
              <th className="px-4 py-2.5 font-medium mono">POP end</th>
              <th className="px-4 py-2.5 font-medium text-right">Obligated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#141417]">
            {matches.map((m) => (
              <tr key={m.award_unique_key}>
                <td className="px-4 py-3 mono">
                  <a href={hrefFor(m)} className="text-amber-400 hover:underline">
                    {m.parent_piid ?? "(no parent)"}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <a href={hrefFor(m)} className="hover:text-amber-400 hover:underline">
                    {m.incumbent_name}
                  </a>
                </td>
                <td className="px-4 py-3 text-zinc-300">{m.awarding_sub_agency_name}</td>
                <td className="px-4 py-3 mono text-zinc-300">{m.pop_current_end_date ?? "—"}</td>
                <td className="px-4 py-3 mono text-right">{fmtM(m.total_obligated_millions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
