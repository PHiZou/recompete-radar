export type ScoreFactor = {
  model: "followon" | "retention";
  label: string;
  value: string;
  effect: number; // log-odds vs. the feature's reference level
};

export type ScoreBreakdown = {
  followon_prob: number;
  retention_prob: number;
  factors: ScoreFactor[];
};

const pct = (p: number) => `${Math.round(p * 100)}%`;

/**
 * Two-column explainer for the backtested scores:
 *   recompete_score    = P(follow-on) × (1 − P(incumbent keeps it))
 *   incumbent_strength = P(incumbent keeps it)
 * Each factor's effect is shown as an odds multiplier (e^effect).
 */
export default function ScoreFactors({ breakdown }: { breakdown: ScoreBreakdown }) {
  const groups = [
    {
      model: "followon" as const,
      title: "Will it come back to market?",
      prob: breakdown.followon_prob,
      // more likely to recompete is good for a challenger
      goodWhenPositive: true,
    },
    {
      model: "retention" as const,
      title: "Can the incumbent hold it?",
      prob: breakdown.retention_prob,
      // a stronger incumbent is bad for a challenger
      goodWhenPositive: false,
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 text-sm">
        {groups.map((g) => (
          <div key={g.model}>
            <div className="flex items-baseline justify-between mb-2">
              <span className="font-medium">{g.title}</span>
              <span className="mono text-zinc-100">{pct(g.prob)}</span>
            </div>
            <div className="space-y-1.5">
              {breakdown.factors
                .filter((f) => f.model === g.model)
                .map((f) => {
                  const odds = Math.exp(f.effect);
                  const neutral = Math.abs(f.effect) < 0.05;
                  const good = f.effect > 0 === g.goodWhenPositive;
                  return (
                    <div key={f.label} className="flex items-center justify-between gap-3">
                      <span className="text-zinc-400 min-w-0">
                        {f.label} · <span className="text-zinc-200">{f.value}</span>
                      </span>
                      <span
                        className={`mono text-xs shrink-0 ${
                          neutral ? "text-zinc-500" : good ? "text-emerald-400" : "text-rose-400"
                        }`}
                        title="Multiplier on the odds, relative to the baseline value for this factor"
                      >
                        {neutral ? "baseline" : `×${odds >= 10 ? odds.toFixed(0) : odds.toFixed(1)} odds`}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 text-xs text-zinc-500">
        Recompete score = {pct(breakdown.followon_prob)} × (1 − {pct(breakdown.retention_prob)}) — the chance
        this becomes work a new vendor wins. Weights are fitted on past contracts with
        inferred follow-ons, so read scores as a ranking, not exact odds.{" "}
        <a href="/insights" className="text-amber-400 hover:underline">How this was validated</a>
      </div>
    </div>
  );
}
