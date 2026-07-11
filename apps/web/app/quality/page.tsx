const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type QualityTest = {
  test_name: string;
  model: string;
  status: string;
  failures: number;
};
type QualityMetric = {
  metric_group: string;
  metric: string;
  value: number;
  unit: string;
};
type QualityReport = {
  run_started_at: string | null;
  tests_total: number;
  tests_passed: number;
  tests_failed: number;
  freshness_days: number | null;
  tests: QualityTest[];
  metrics: QualityMetric[];
};

async function fetchQuality(): Promise<QualityReport | null> {
  try {
    const res = await fetch(`${API_BASE}/quality`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as QualityReport;
    if (!data || data.tests_total === 0) return null;
    return data;
  } catch {
    return null;
  }
}

const fmtMetric = (m: QualityMetric): string => {
  if (m.unit === "fraction") return `${(m.value * 100).toFixed(2)}%`;
  if (m.unit === "days") return `${m.value.toFixed(2)} d`;
  if (m.unit === "rows" || m.unit === "agencies")
    return m.value.toLocaleString();
  if (m.unit === "epoch_seconds")
    return new Date(m.value * 1000).toISOString().slice(0, 16).replace("T", " ");
  return `${m.value}`;
};

const GROUP_LABEL: Record<string, string> = {
  row_count: "Row counts",
  freshness: "Source freshness",
  null_rate: "Null rates · scoring drivers",
  coverage: "Coverage",
};

export default async function QualityPage() {
  const report = await fetchQuality();
  const isLive = report !== null;

  const testsPassed = report?.tests_passed ?? 0;
  const testsFailed = report?.tests_failed ?? 0;
  const testsTotal = report?.tests_total ?? 0;
  const freshness = report?.freshness_days ?? null;
  const agencies = report?.metrics.find(
    (m) => m.metric === "distinct_top_agencies"
  )?.value;
  const allGreen = isLive && testsFailed === 0;

  const groups = ["row_count", "freshness", "null_rate", "coverage"];

  return (
    <section>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold">Data quality</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            dbt test outcomes + pipeline metrics, refreshed every build.
          </p>
        </div>
        <div className="text-xs text-zinc-500 mono text-right">
          {isLive ? (
            <>
              last run{" "}
              {report!.run_started_at
                ? report!.run_started_at.slice(0, 19).replace("T", " ") + "Z"
                : "—"}
            </>
          ) : (
            <span className="text-amber-500">no snapshot (API offline)</span>
          )}
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <Tile
          label="dbt tests"
          value={`${testsPassed}/${testsTotal}`}
          note="passing"
          tone={allGreen ? "ok" : testsTotal === 0 ? "muted" : "bad"}
        />
        <Tile
          label="Failing"
          value={`${testsFailed}`}
          note={testsFailed === 0 ? "all green" : "needs attention"}
          tone={testsFailed === 0 ? "ok" : "bad"}
        />
        <Tile
          label="Data freshness"
          value={freshness === null ? "—" : `${freshness.toFixed(1)}d`}
          note="since last load"
          tone={
            freshness === null ? "muted" : freshness <= 7 ? "ok" : "bad"
          }
        />
        <Tile
          label="Agencies covered"
          value={agencies !== undefined ? `${agencies}` : "—"}
          note="top-tier in marts"
          tone="muted"
        />
      </div>

      {/* Tests table */}
      <div className="card overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-[#1f1f23] text-sm text-zinc-400">
          Test results ·{" "}
          <span className="text-zinc-100">{testsTotal}</span> checks
          {!isLive && (
            <span className="text-amber-500 ml-2">· API offline</span>
          )}
        </div>
        <table className="w-full text-sm row-hover">
          <thead className="text-left text-zinc-500 text-xs uppercase tracking-wider">
            <tr className="border-b border-[#1f1f23]">
              <th className="px-4 py-2.5 font-medium">Model</th>
              <th className="px-4 py-2.5 font-medium">Test</th>
              <th className="px-4 py-2.5 font-medium text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#141417]">
            {(report?.tests ?? []).map((t, i) => (
              <tr key={`${t.model}-${t.test_name}-${i}`}>
                <td className="px-4 py-2.5 mono text-zinc-300">{t.model}</td>
                <td className="px-4 py-2.5">{t.test_name}</td>
                <td className="px-4 py-2.5 text-right">
                  <StatusBadge status={t.status} failures={t.failures} />
                </td>
              </tr>
            ))}
            {(report?.tests ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-6 text-center text-zinc-500 text-sm"
                >
                  No test snapshot. Run{" "}
                  <span className="mono">dbt test</span> then{" "}
                  <span className="mono">python pipelines/dq_snapshot.py</span>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3">
        {groups.map((g) => {
          const rows = (report?.metrics ?? []).filter(
            (m) => m.metric_group === g
          );
          if (rows.length === 0) return null;
          return (
            <div key={g} className="card p-4">
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
                {GROUP_LABEL[g] ?? g}
              </div>
              <div className="space-y-2">
                {rows.map((m) => (
                  <div
                    key={m.metric}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-zinc-400 mono text-xs">
                      {m.metric}
                    </span>
                    <span className="mono text-zinc-100">{fmtMetric(m)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Tile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "ok" | "bad" | "muted";
}) {
  const valueColor =
    tone === "ok"
      ? "text-emerald-400"
      : tone === "bad"
      ? "text-red-400"
      : "text-zinc-100";
  return (
    <div className="card px-4 py-3">
      <div className="text-xs text-zinc-500 uppercase tracking-wider">
        {label}
      </div>
      <div className={`mono text-2xl font-semibold mt-1 ${valueColor}`}>
        {value}
      </div>
      <div className="text-xs text-zinc-500 mt-1">{note}</div>
    </div>
  );
}

function StatusBadge({
  status,
  failures,
}: {
  status: string;
  failures: number;
}) {
  const pass = status === "pass";
  const warn = status === "warn";
  const cls = pass
    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
    : warn
    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
    : "bg-red-500/10 text-red-400 border-red-500/20";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs mono ${cls}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          pass ? "bg-emerald-400" : warn ? "bg-amber-400" : "bg-red-400"
        }`}
      />
      {pass ? "pass" : `${status}${failures ? ` (${failures})` : ""}`}
    </span>
  );
}
