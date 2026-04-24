import { notFound } from "next/navigation";
import { agencyProfiles } from "@/lib/mock-data";

const fmtM = (m: number) =>
  m >= 1000 ? `$${(m / 1000).toFixed(2)}B` : `$${m.toFixed(0)}M`;

export default function AgencyPage({ params }: { params: { id: string } }) {
  const agency = agencyProfiles[params.id];
  if (!agency) notFound();

  const pipelineMax = Math.max(...agency.pipeline.map((p) => p.dollarsMillions));

  return (
    <section>
      <div className="text-xs text-zinc-500 mb-4 mono">
        <a href="/" className="hover:text-zinc-300">radar</a>
        <span className="mx-1">/</span>
        <span>agencies</span>
        <span className="mx-1">/</span>
        <span className="text-zinc-100">{agency.name.toLowerCase()}</span>
      </div>

      <div className="card p-6 mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {agency.name}
          </h1>
          <span className="text-xs text-zinc-500 mono border border-[#1f1f23] rounded-md px-2 py-0.5">
            toptier · {agency.subAgencyCount} sub-agencies
          </span>
        </div>
        <div className="mt-1 text-sm text-zinc-500">{agency.description}</div>

        <div className="grid grid-cols-5 gap-6 mt-6">
          <Metric
            label="5yr obligated"
            value={`$${agency.fiveYearObligatedBillions.toFixed(1)}`}
            suffix="B"
            noteEl={
              <span className="text-emerald-400">
                ↑ {agency.cagrPct.toFixed(1)}% CAGR
              </span>
            }
          />
          <Metric
            label="Unique vendors"
            value={agency.uniqueVendors.toLocaleString()}
            note="with ≥1 award in 5yr"
          />
          <Metric
            label="HHI (541512)"
            value={`${agency.hhi}`}
            noteEl={
              <span className="text-emerald-400">
                competitive · low concentration
              </span>
            }
          />
          <Metric
            label="Top NAICS"
            textValue={agency.topNaics}
            textMono
            note="by 5yr obligations"
          />
          <Metric
            label="Recompete exposure"
            value={`$${agency.recompeteExposureBillions.toFixed(2)}`}
            suffix="B"
            accent
            note={`${agency.recompeteCandidates} candidates · next 12mo`}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5 col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-medium">
                Recompete pipeline · next 36 months
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                Candidates by POP-end quarter · NAICS 541511/541512 · bar height = $M at stake
              </div>
            </div>
            <div className="text-xs text-zinc-500 mono">
              peak: Q3 2026 · {fmtM(pipelineMax)}
            </div>
          </div>
          <PipelineChart data={agency.pipeline} max={pipelineMax} />
        </div>

        <div className="card p-5">
          <div className="text-sm font-medium mb-1">Top vendors · 541512</div>
          <div className="text-xs text-zinc-500 mb-4">
            Share of 5yr obligations at DHS
          </div>
          <div className="space-y-3">
            {agency.topVendors.map((v) => (
              <div key={v.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>{v.name}</span>
                  <span className="mono text-zinc-400">{v.share}%</span>
                </div>
                <div
                  className="h-1.5 bar-accent"
                  style={{ width: `${v.bar}%` }}
                />
              </div>
            ))}
            <div>
              <div className="flex items-center justify-between text-sm mb-1 text-zinc-500">
                <span>Other ({agency.uniqueVendors - 7} vendors)</span>
                <span className="mono">47.6%</span>
              </div>
              <div className="h-1.5 bar" style={{ width: "95%" }} />
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f1f23]">
          <div className="text-sm font-medium">Sub-agency breakdown</div>
          <div className="text-xs text-zinc-500">
            Obligations · 541511+541512 · FY2020–FY2025
          </div>
        </div>
        <table className="w-full text-sm row-hover">
          <thead className="text-left text-zinc-500 text-xs uppercase tracking-wider">
            <tr className="border-b border-[#1f1f23]">
              <th className="px-4 py-2.5 font-medium">Sub-agency</th>
              <th className="px-4 py-2.5 font-medium text-right">5yr obligated</th>
              <th className="px-4 py-2.5 font-medium text-right">Vendors</th>
              <th className="px-4 py-2.5 font-medium text-right">HHI</th>
              <th className="px-4 py-2.5 font-medium text-right">
                Recompete candidates
              </th>
              <th className="px-4 py-2.5 font-medium text-right">
                $ at stake (12mo)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#141417]">
            {agency.subAgencyBreakdown.map((s) => (
              <tr key={s.name}>
                <td className="px-4 py-3">{s.name}</td>
                <td className="px-4 py-3 mono text-right">
                  ${s.fiveYearBillions.toFixed(1)}B
                </td>
                <td className="px-4 py-3 mono text-right">
                  {s.vendors.toLocaleString()}
                </td>
                <td className="px-4 py-3 mono text-right">{s.hhi}</td>
                <td className="px-4 py-3 mono text-right">{s.candidates}</td>
                <td
                  className={
                    "px-4 py-3 mono text-right " +
                    (s.atStakeHot ? "text-amber-400" : "")
                  }
                >
                  {fmtM(s.atStakeMillions)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
  noteEl,
  accent,
}: {
  label: string;
  value?: string;
  suffix?: string;
  textValue?: string;
  textMono?: boolean;
  note?: string;
  noteEl?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-zinc-500 uppercase tracking-wider">
        {label}
      </div>
      {textValue ? (
        <div
          className={`text-sm font-medium mt-1 ${textMono ? "mono" : ""}`}
        >
          {textValue}
        </div>
      ) : (
        <div
          className={`mono text-2xl font-semibold mt-1 ${
            accent ? "text-amber-400" : ""
          }`}
        >
          {value}
          {suffix && <span className="text-zinc-500 text-lg">{suffix}</span>}
        </div>
      )}
      <div className="text-xs text-zinc-500 mt-0.5">{noteEl ?? note}</div>
    </div>
  );
}

function PipelineChart({
  data,
  max,
}: {
  data: {
    quarter: string;
    dollarsMillions: number;
    tone: "peak" | "high" | "mid" | "low";
  }[];
  max: number;
}) {
  const width = 700;
  const height = 220;
  const top = 20;
  const bottom = 170;
  const chartHeight = bottom - top;
  const xStart = 30;
  const barWidth = 46;
  const step = (width - xStart - 20) / data.length;

  const color = (tone: string, v: number) => {
    if (tone === "peak") return { fill: "#f59e0b", opacity: 1 };
    if (tone === "high") return { fill: "#f59e0b", opacity: 0.6 };
    if (tone === "mid") return { fill: "#71717a", opacity: 1 };
    return { fill: "#52525b", opacity: 1 };
  };

  const gridLines = [max, max * 0.75, max * 0.5, max * 0.25];
  const y = (v: number) => bottom - (v / max) * chartHeight;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56">
      {gridLines.map((v, i) => (
        <line
          key={i}
          x1={xStart}
          y1={y(v)}
          x2={width - 20}
          y2={y(v)}
          stroke="#1f1f23"
        />
      ))}
      {gridLines.map((v, i) => (
        <text
          key={`l${i}`}
          x={2}
          y={y(v) + 4}
          fontFamily="JetBrains Mono"
          fontSize="10"
          fill="#52525b"
        >
          {fmtM(v)}
        </text>
      ))}
      {data.map((d, i) => {
        const { fill, opacity } = color(d.tone, d.dollarsMillions);
        const h = (d.dollarsMillions / max) * chartHeight;
        const x = xStart + i * step;
        return (
          <g key={d.quarter}>
            <rect
              x={x}
              y={bottom - h}
              width={barWidth}
              height={h}
              fill={fill}
              opacity={opacity}
            />
            <text
              x={x + barWidth / 2}
              y={bottom + 20}
              fontFamily="JetBrains Mono"
              fontSize="10"
              fill="#a1a1aa"
              textAnchor="middle"
            >
              {d.quarter}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
