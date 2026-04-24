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

export function scoreTone(value: number): Tone {
  if (value >= 90) return "hot";
  if (value >= 75) return "hi";
  if (value >= 60) return "mid";
  return "lo";
}
