export function scoreTierColor(val: number | null): string {
  if (val == null) return 'var(--text-disabled)';
  if (val >= 80) return 'var(--gold)';
  if (val >= 60) return 'var(--text-primary)';
  return 'var(--text-muted)';
}

export function ScoreReadout({
  label,
  value,
  hidden,
}: {
  label: string;
  value: number | null;
  hidden: boolean;
}) {
  const display = value == null ? '—' : hidden ? '•••' : String(Math.round(value));
  const color = hidden ? 'var(--text-disabled)' : scoreTierColor(value);
  const glow = !hidden && value != null && value >= 80 ? '0 0 10px rgba(242,180,65,0.5)' : 'none';
  return (
    <div className="score-box">
      <div className="score-label">{label}</div>
      <div className="score-value" style={{ color, textShadow: glow }}>
        {display}
      </div>
    </div>
  );
}
