import { notFound } from "next/navigation";

const fmtM = (m: number) =>
  m >= 1000 ? `$${(m / 1000).toFixed(2)}B` : `$${m.toFixed(0)}M`;

type TopVendor = {
  uei: string;
  name: string;
  obligated_millions: number;
  share_pct: number;
};

type AgencyProfile = {
  id: string;
  name: string;
  parent_name: string;
  level: string;
  total_obligated_millions: number;
  award_count: number;
  unique_vendors: number;
  naics_count: number;
  recompete_candidates: number;
  recompete_exposure_millions: number;
  top_vendors: TopVendor[];
};

async function fetchAgency(id: string): Promise<AgencyProfile | null> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const res = await fetch(`${base}/agencies/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as AgencyProfile;
}

export default async function AgencyPage({
  params,
}: {
  params: { id: string };
}) {
  const a = await fetchAgency(params.id);
  if (!a) notFound();

  const maxShare = Math.max(...a.top_vendors.map((v) => v.share_pct), 1);

  return (
    <section>
      <div className="text-xs text-zinc-500 mb-4 mono">
        <a href="/" className="hover:text-zinc-300">radar</a>
        <span className="mx-1">/</span>
        <span>agencies</span>
        <span className="mx-1">/</span>
        <span className="text-zinc-100">{a.id}</span>
      </div>

      <div className="card p-6 mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{a.name}</h1>
          <span className="text-xs text-zinc-500 mono border border-[#1f1f23] rounded-md px-2 py-0.5">
            {a.level === "top" ? "toptier" : "sub-agency"} · code {a.id}
          </span>
        </div>
        {a.level === "sub" && (
          <div className="mt-1 text-sm text-zinc-500">
            Parent · {a.parent_name}
          </div>
        )}

        <div className="grid grid-cols-5 gap-6 mt-6">
          <Metric
            label="Total obligated (slice)"
            value={`$${(a.total_obligated_millions / 1000).toFixed(2)}`}
            suffix="B"
            note={`${a.award_count.toLocaleString()} awards`}
          />
          <Metric
            label="Unique vendors"
            value={a.unique_vendors.toLocaleString()}
            note="with ≥1 award"
          />
          <Metric
            label="Recompete candidates"
            value={`${a.recompete_candidates}`}
            note="active POP-end window"
          />
          <Metric
            label="Recompete exposure"
            value={`$${(a.recompete_exposure_millions / 1000).toFixed(2)}`}
            suffix="B"
            accent
            note="obligated $ at stake"
          />
          <Metric
            label="NAICS coverage"
            value={`${a.naics_count}`}
            note="distinct codes in slice"
          />
        </div>
      </div>

      <div className="card p-5">
        <div className="text-sm font-medium mb-1">Top vendors by obligations</div>
        <div className="text-xs text-zinc-500 mb-4">
          Share of total obligated $ in the DHS · 541511/541512 slice
        </div>
        {a.top_vendors.length === 0 ? (
          <div className="text-sm text-zinc-500">No vendor data.</div>
        ) : (
          <div className="space-y-3">
            {a.top_vendors.map((v) => (
              <a
                key={v.uei}
                href={`/vendors/${v.uei}`}
                className="block hover:bg-[#141417] -mx-2 px-2 py-1 rounded"
              >
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>{v.name}</span>
                  <span className="mono text-zinc-400">
                    {v.share_pct.toFixed(2)}% · {fmtM(v.obligated_millions)}
                  </span>
                </div>
                <div
                  className="h-1.5 bar-accent"
                  style={{ width: `${(v.share_pct / maxShare) * 100}%` }}
                />
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 text-xs text-zinc-500 mono">
        Recompete-pipeline histogram and sub-agency drilldown deferred to Phase 2.
      </div>
    </section>
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
    <div>
      <div className="text-xs text-zinc-500 uppercase tracking-wider">{label}</div>
      <div
        className={`mono text-2xl font-semibold mt-1 ${
          accent ? "text-amber-400" : ""
        }`}
      >
        {value}
        {suffix && <span className="text-zinc-500 text-lg">{suffix}</span>}
      </div>
      <div className="text-xs text-zinc-500 mt-0.5">{note}</div>
    </div>
  );
}
