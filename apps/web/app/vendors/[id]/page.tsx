import { notFound } from "next/navigation";
import ScorePill, { scoreTone } from "@/components/score-pill";
import { vendorProfiles as mockVendorProfiles } from "@/lib/mock-data";

const fmtM = (m: number) =>
  m >= 1000 ? `$${(m / 1000).toFixed(2)}B` : `$${m.toFixed(1)}M`;

type VendorAward = {
  piid: string;
  sub_agency: string;
  pop_end: string;
  value_millions: number;
  recompete_score: number;
};

type VendorProfile = {
  uei: string;
  name: string;
  lifetime_obligated_millions: number;
  award_count: number;
  active_award_count: number;
  sub_agency_count: number;
  naics_count: number;
  top_naics_code: string;
  top_naics_description: string;
  top_sub_agency_name: string;
  active_awards: VendorAward[];
};

async function fetchVendor(id: string): Promise<VendorProfile | null> {
  const mockVendor = () => {
    const mock = mockVendorProfiles[id];
    if (!mock) return null;
    return {
      uei: mock.id,
      name: mock.name,
      lifetime_obligated_millions: mock.lifetimeObligatedBillions * 1000,
      award_count: mock.activeAwards,
      active_award_count: mock.dhsRecompeteCandidates,
      sub_agency_count: mock.agencyCount,
      naics_count: mock.topNaics.split(" · ").length,
      top_naics_code: mock.topNaics.split(" · ")[0] ?? "",
      top_naics_description: mock.topNaicsDescription,
      top_sub_agency_name: mock.topAgencies.split(" · ")[0] ?? "",
      active_awards: mock.activeDhsAwards.map((a) => ({
        piid: a.piid,
        sub_agency: a.subAgency,
        pop_end: a.popEnd,
        value_millions: a.valueMillions,
        recompete_score: a.recompeteScore,
      })),
    } satisfies VendorProfile;
  };
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${base}/vendors/${id}`, { cache: "no-store" });
    if (!res.ok) return mockVendor();
    return (await res.json()) as VendorProfile;
  } catch {
    return mockVendor();
  }
}

export default async function VendorPage({
  params,
}: {
  params: { id: string };
}) {
  const v = await fetchVendor(params.id);
  if (!v) notFound();

  return (
    <section>
      <div className="text-xs text-zinc-500 mb-4 mono">
        <a href="/" className="hover:text-zinc-300">radar</a>
        <span className="mx-1">/</span>
        <span>vendors</span>
        <span className="mx-1">/</span>
        <span className="text-zinc-100">{v.uei}</span>
      </div>

      <div className="card p-4 sm:p-6 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
                {v.name}
              </h1>
              <span className="text-xs text-zinc-500 mono border border-[#1f1f23] rounded-md px-2 py-0.5">
                UEI · {v.uei}
              </span>
            </div>
            <div className="mt-1 text-sm text-zinc-500">
              Loaded award slice · IT/data services · obligations to date
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 sm:gap-6 mt-6">
          <Metric
            label="Lifetime obligated (DHS slice)"
            value={`$${(v.lifetime_obligated_millions / 1000).toFixed(2)}`}
            suffix="B"
            note={`${v.award_count} awards`}
          />
          <Metric
            label="Active awards"
            value={`${v.active_award_count}`}
            note={`across ${v.sub_agency_count} sub-agencies`}
          />
          <Metric
            label="Top sub-agency"
            textValue={v.top_sub_agency_name || "—"}
            note="by obligations"
          />
          <Metric
            label="Top NAICS"
            textValue={v.top_naics_code || "—"}
            textMono
            note={v.top_naics_description}
          />
          <Metric
            label="NAICS breadth"
            value={`${v.naics_count}`}
            note="distinct codes in slice"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-4 py-3 border-b border-[#1f1f23]">
          <div className="text-sm font-medium">Active recompete candidates</div>
          <div className="text-xs text-zinc-500">
            {v.active_awards.length} shown · sorted by recompete score
          </div>
        </div>
        {v.active_awards.length === 0 ? (
          <div className="px-4 py-8 text-sm text-zinc-500">
            No active candidates in the current window.
          </div>
        ) : (
          <table className="w-full text-sm row-hover">
            <thead className="text-left text-zinc-500 text-xs uppercase tracking-wider">
              <tr className="border-b border-[#1f1f23]">
                <th className="px-4 py-2.5 font-medium">PIID</th>
                <th className="px-4 py-2.5 font-medium">Sub-agency</th>
                <th className="px-4 py-2.5 font-medium">POP end</th>
                <th className="px-4 py-2.5 font-medium text-right">Value</th>
                <th className="px-4 py-2.5 font-medium text-right">Recompete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141417]">
              {v.active_awards.map((a) => (
                <tr key={a.piid}>
                  <td className="px-4 py-3 mono">
                    <a
                      href={`/contracts/${encodeURIComponent(a.piid)}`}
                      className="hover:text-amber-400 hover:underline"
                    >
                      {a.piid}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{a.sub_agency}</td>
                  <td className="px-4 py-3 mono text-zinc-300">{a.pop_end}</td>
                  <td className="px-4 py-3 mono text-right">
                    {fmtM(a.value_millions)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ScorePill
                      value={a.recompete_score}
                      tone={scoreTone(a.recompete_score)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 text-xs text-zinc-500 mono">
        Award-history chart and competes-with panel deferred to Phase 2 — they
        require multi-year non-DHS coverage and a teaming-graph mart.
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  suffix,
  textValue,
  textMono,
  note,
}: {
  label: string;
  value?: string;
  suffix?: string;
  textValue?: string;
  textMono?: boolean;
  note?: string;
}) {
  return (
    <div>
      <div className="text-xs text-zinc-500 uppercase tracking-wider">{label}</div>
      {textValue ? (
        <div
          className={`text-sm font-medium mt-1 ${textMono ? "mono" : ""}`}
        >
          {textValue}
        </div>
      ) : (
        <div className="mono text-2xl font-semibold mt-1">
          {value}
          {suffix && <span className="text-zinc-500 text-lg">{suffix}</span>}
        </div>
      )}
      <div className="text-xs text-zinc-500 mt-0.5">{note}</div>
    </div>
  );
}
