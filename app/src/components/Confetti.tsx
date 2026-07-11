const COLORS = ['#F2B441', '#FFD874', '#22D3C6', '#6EEFE0', '#FFFFFF'];
const COUNT = 26;

const PIECES = Array.from({ length: COUNT }).map((_, i) => {
  const left = (i * 37) % 100;
  const delay = (i * 0.37) % 2.6;
  const duration = 2.6 + ((i * 0.53) % 1.8);
  const size = 6 + (i % 3) * 3;
  const color = COLORS[i % COLORS.length];
  const rounded = i % 2 === 0;
  return { left, delay, duration, size, color, rounded };
});

export function Confetti() {
  return (
    <div className="confetti-layer">
      {PIECES.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * (p.rounded ? 1 : 1.6),
            background: p.color,
            borderRadius: p.rounded ? '50%' : '2px',
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
