import type { Player } from '../types';

const STYLE: Record<Player['roleBadge'], { fg: string; bg: string; border: string }> = {
  Batter: { fg: 'var(--role-batter-fg)', bg: 'var(--role-batter-bg)', border: 'var(--role-batter-border)' },
  'All-rounder': {
    fg: 'var(--role-allrounder-fg)',
    bg: 'var(--role-allrounder-bg)',
    border: 'var(--role-allrounder-border)',
  },
  Bowler: { fg: 'var(--role-bowler-fg)', bg: 'var(--role-bowler-bg)', border: 'var(--role-bowler-border)' },
  Keeper: { fg: 'var(--role-keeper-fg)', bg: 'var(--role-keeper-bg)', border: 'var(--role-keeper-border)' },
};

export function RoleBadge({ role }: { role: Player['roleBadge'] }) {
  const s = STYLE[role];
  return (
    <span
      className="role-badge"
      style={{ color: s.fg, background: s.bg, borderColor: s.border }}
    >
      {role}
    </span>
  );
}
