type Tone = "hot" | "hi" | "mid" | "lo" | "str";

export default function ScorePill({
  value,
  tone,
}: {
  value: number;
  tone: Tone;
}) {
  return <span className={`score-pill s-${tone}`}>{value}</span>;
}

// Cutoffs sit near the top 3% / 10% / 25% of live recompete scores
// (2026-09 scoring rebuild; scores are probabilities, so few exceed ~75).
export function scoreTone(value: number): Tone {
  if (value >= 68) return "hot";
  if (value >= 60) return "hi";
  if (value >= 50) return "mid";
  return "lo";
}
