interface ShareCardData {
  headline: string;
  finalScore: number;
  finalWickets: number;
  oversLabel: string;
  bestPerformer: { name: string; runs: number; balls: number } | null;
  won: boolean;
}

export function drawShareCard(canvas: HTMLCanvasElement, data: ShareCardData) {
  const W = 1200;
  const H = 630;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // background
  const grad = ctx.createRadialGradient(W * 0.15, 0, 0, W * 0.15, 0, W * 0.9);
  grad.addColorStop(0, '#17203f');
  grad.addColorStop(0.45, '#0d1326');
  grad.addColorStop(1, '#0a0f1e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // subtle gold glow, top-left
  const glow = ctx.createRadialGradient(140, 60, 0, 140, 60, 340);
  glow.addColorStop(0, 'rgba(242,180,65,0.22)');
  glow.addColorStop(1, 'rgba(242,180,65,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // wordmark
  ctx.textBaseline = 'alphabetic';
  ctx.font = '800 56px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#f4f6fb';
  ctx.fillText('IPL', 64, 96);
  const iplWidth = ctx.measureText('IPL').width;
  ctx.fillStyle = '#f2b441';
  ctx.fillText('-300', 64 + iplWidth, 96);

  // headline
  ctx.font = '700 40px "Barlow Condensed", sans-serif';
  ctx.fillStyle = data.won ? '#22d3c6' : '#f4f6fb';
  wrapText(ctx, data.headline, 64, 180, W - 128, 46);

  // scoreboard tile
  ctx.font = '400 96px "Graduate", serif';
  ctx.fillStyle = '#0b0b0c';
  roundRect(ctx, 64, 260, 420, 140, 10);
  ctx.fill();
  ctx.strokeStyle = data.won ? 'rgba(242,180,65,0.55)' : 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  roundRect(ctx, 64, 260, 420, 140, 10);
  ctx.stroke();

  ctx.fillStyle = '#f5f3ec';
  ctx.fillText(`${data.finalScore}`, 96, 355);
  const scoreWidth = ctx.measureText(`${data.finalScore}`).width;
  ctx.fillStyle = '#6c7590';
  ctx.fillText('/', 96 + scoreWidth + 8, 355);
  const slashWidth = ctx.measureText('/').width;
  ctx.fillStyle = '#f5f3ec';
  ctx.fillText(`${data.finalWickets}`, 96 + scoreWidth + 8 + slashWidth + 8, 355);

  ctx.font = '400 22px Inter, sans-serif';
  ctx.fillStyle = '#8e97b0';
  ctx.fillText(`in ${data.oversLabel} overs · target 301`, 64, 435);

  if (data.bestPerformer) {
    ctx.font = '700 13px "Barlow Condensed", sans-serif';
    ctx.fillStyle = '#f2b441';
    ctx.fillText('BEST PERFORMER', 64, 480);
    ctx.font = '600 26px Inter, sans-serif';
    ctx.fillStyle = '#f4f6fb';
    ctx.fillText(data.bestPerformer.name, 64, 515);
    ctx.font = '700 20px "Barlow Condensed", sans-serif';
    ctx.fillStyle = '#f2b441';
    ctx.fillText(`${data.bestPerformer.runs} off ${data.bestPerformer.balls} balls`, 64, 545);
  }

  ctx.font = '400 18px Inter, sans-serif';
  ctx.fillStyle = '#5c6480';
  ctx.fillText('ipl-300.app', 64, H - 40);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}
