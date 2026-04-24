import { notFound } from "next/navigation";
import ScorePill, { scoreTone } from "@/components/score-pill";
import { vendorProfiles } from "@/lib/mock-data";

const fmtM = (m: number) =>
  m >= 1000 ? `$${(m / 1000).toFixed(2)}B` : `$${m.toFixed(1)}M`;

export default function VendorPage({ params }: { params: { id: string } }) {
  const vendor = vendorProfiles[params.id];
  if (!vendor) notFound();

  const maxYear = Math.max(
    ...vendor.awardsByYear.map((y) => y.dod + y.dhs + y.hhs + y.other)
  );

  return (
    <section>
      <div className="text-xs text-zinc-500 mb-4 mono">
        <a href="/" className="hover:text-zinc-300">radar</a>
        <span className="mx-1">/</span>
        <span className="hover:text-zinc-300">vendors</span>
        <span className="mx-1">/</span>
        <span className="text-zinc-100">{vendor.id}</span>
      </div>

      <div className="card p-6 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {vendor.name}
              </h1>
              <span className="text-xs text-zinc-500 mono border border-[#1f1f23] rounded-md px-2 py-0.5">
                resolved · {vendor.aliasCount} aliases
              </span>
            </div>
            <div className="mt-1 text-sm text-zinc-500 mono">
              UEI {vendor.uei} · DUNS {vendor.duns} · {vendor.city}, {vendor.state} · {vendor.size}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-3 h-9 card text-sm text-zinc-400">Compare</button>
            <button className="px-3 h-9 card text-sm text-zinc-400">Export</button>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-6 mt-6">
          <Metric
            label="Lifetime obligated"
            value={`$${vendor.lifetimeObligatedBillions.toFixed(1)}`}
            suffix="B"
            note="FY2015–present"
          />
          <Metric
            label="Active awards"
            value={`${vendor.activeAwards}`}
            note={`across ${vendor.agencyCount} agencies`}
          />
          <Metric
            label="DHS recompete exposure"
            value={`$${vendor.dhsRecompeteExposureBillions.toFixed(2)}`}
            suffix="B"
            note={`${vendor.dhsRecompeteCandidates} candidates · next 24mo`}
            accent
          />
          <Metric
            label="Top agencies"
            textValue={vendor.topAgencies}
            note="by 5yr obligations"
          />
          <Metric
            label="Top NAICS"
            textValue={vendor.topNaics}
            textMono
            note={vendor.topNaicsDescription}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5 col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-medium">
                Award history by fiscal year
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                Stacked by agency · obligations, USD billions
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-400">
              <Legend color="#f59e0b" label="DoD" />
              <Legend color="#0ea5e9" label="DHS" />
              <Legend color="#10b981" label="HHS" />
              <Legend color="#71717a" label="Other" />
            </div>
          </div>
          <StackedBarChart data={vendor.awardsByYear} max={maxYear + 1} />
        </div>

        <div className="card p-5">
          <div className="text-sm font-medium mb-1">Competes with</div>
          <div className="text-xs text-zinc-500 mb-4">
            Vendors sharing (agency, NAICS) cells over 5yr
          </div>
          <div className="space-y-3">
            {vendor.competesWith.map((c) => (
              <div key={c.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>{c.name}</span>
                  <span className="mono text-zinc-400">{c.sharedCells}</span>
                </div>
                <div
                  className="h-1.5 bar-accent"
                  style={{ width: `${c.share}%` }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card mt-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f1f23]">
          <div className="text-sm font-medium">Active awards · DHS filter</div>
          <div className="text-xs text-zinc-500">
            {vendor.dhsRecompeteCandidates} shown ·{" "}
            {fmtM(vendor.dhsRecompeteExposureBillions * 1000)}
          </div>
        </div>
        <table className="w-full text-sm row-hover">
          <thead className="text-left text-zinc-500 text-xs uppercase tracking-wider">
            <tr className="border-b border-[#1f1f23]">
              <th className="px-4 py-2.5 font-medium">Contract</th>
              <th className="px-4 py-2.5 font-medium">Sub-agency</th>
              <th className="px-4 py-2.5 font-medium">POP end</th>
              <th className="px-4 py-2.5 font-medium text-right">Value</th>
              <th className="px-4 py-2.5 font-medium text-right">Recompete</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#141417]">
            {vendor.activeDhsAwards.map((a) => (
              <tr key={a.piid}>
                <td className="px-4 py-3">
                  <div className="font-medium">{a.title}</div>
                  <div className="mono text-xs text-zinc-500">{a.piid}</div>
                </td>
                <td className="px-4 py-3 text-zinc-300">{a.subAgency}</td>
                <td className="px-4 py-3 mono text-zinc-300">{a.popEnd}</td>
                <td className="px-4 py-3 mono text-right">
                  {fmtM(a.valueMillions)}
                </td>
                <td className="px-4 py-3 text-right">
                  <ScorePill
                    value={a.recompeteScore}
                    tone={scoreTone(a.recompeteScore)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-3 text-xs text-zinc-500 border-t border-[#1f1f23]">
          Showing {vendor.activeDhsAwards.length} of{" "}
          {vendor.dhsRecompeteCandidates}
        </div>
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
  accent,
}: {
  label: string;
  value?: string;
  suffix?: string;
  textValue?: string;
  textMono?: boolean;
  note: string;
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
      <div className="text-xs text-zinc-500 mt-0.5">{note}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="w-2 h-2 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function StackedBarChart({
  data,
  max,
}: {
  data: {
    fy: number;
    dod: number;
    dhs: number;
    hhs: number;
    other: number;
    partial?: boolean;
  }[];
  max: number;
}) {
  const width = 700;
  const height = 260;
  const top = 20;
  const bottom = 210;
  const chartHeight = bottom - top;
  const xStart = 40;
  const barWidth = 60;
  const step = (width - xStart) / data.length;

  const y = (v: number) => bottom - (v / max) * chartHeight;
  const gridLines = [max, max * 0.75, max * 0.5, max * 0.25];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-64">
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
          x={10}
          y={y(v) + 4}
          fontFamily="JetBrains Mono"
          fontSize="10"
          fill="#52525b"
        >
          ${v.toFixed(0)}B
        </text>
      ))}
      {data.map((d, i) => {
        const x = xStart + i * step + 10;
        const opacity = d.partial ? 0.6 : 1;
        let cursor = bottom;
        const pieces: { color: string; value: number }[] = [
          { color: "#f59e0b", value: d.dod },
          { color: "#0ea5e9", value: d.dhs },
          { color: "#10b981", value: d.hhs },
          { color: "#71717a", value: d.other },
        ];
        const rects = pieces.map((p, idx) => {
          const h = (p.value / max) * chartHeight;
          const yTop = cursor - h;
          const rect = (
            <rect
              key={idx}
              x={x}
              y={yTop}
              width={barWidth}
              height={h}
              fill={p.color}
              opacity={opacity}
            />
          );
          cursor = yTop;
          return rect;
        });
        return (
          <g key={d.fy}>
            {rects}
            <text
              x={x + barWidth / 2}
              y={bottom + 18}
              fontFamily="JetBrains Mono"
              fontSize="10"
              fill="#a1a1aa"
              textAnchor="middle"
            >
              FY{String(d.fy).slice(2)}
              {d.partial ? "*" : ""}
            </text>
          </g>
        );
      })}
      <text
        x={width - 80}
        y={height - 4}
        fontFamily="JetBrains Mono"
        fontSize="9"
        fill="#52525b"
        textAnchor="middle"
      >
        * YTD
      </text>
    </svg>
  );
}
