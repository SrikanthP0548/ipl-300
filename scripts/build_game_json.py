import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy.optimize import linear_sum_assignment

from build_csv import compute_all_players, classify_role, TEAMS

# ±N position flex per role category, applied to the canonical (given) position,
# clipped to [1, 11]. Calibrated below via a per-team-season feasibility check
# (does a perfect matching exist between this team's 11 players and slots 1-11).
FLEX_TABLE = {
    'Opener':               1,
    'Top-order Batter':     2,
    'Middle-order Batter':  2,
    'Wicketkeeper Batter':  3,
    'Finisher':             2,
    'Batting All-rounder':  2,
    'Bowling All-rounder':  3,
    'Spinner':              2,
    'Pacer':                2,
    'Specialist Bowler':    2,
}

# 10 fine-grained role categories -> 4 display badges used in the UI
BADGE_MAP = {
    'Opener': 'Batter',
    'Top-order Batter': 'Batter',
    'Middle-order Batter': 'Batter',
    'Finisher': 'Batter',
    'Wicketkeeper Batter': 'Keeper',
    'Batting All-rounder': 'All-rounder',
    'Bowling All-rounder': 'All-rounder',
    'Spinner': 'Bowler',
    'Pacer': 'Bowler',
    'Specialist Bowler': 'Bowler',
}


def check_feasibility(team_players):
    """team_players: list of dicts with minPos/maxPos. Returns True if a perfect
    matching against slots 1-11 exists (every slot fillable, every player usable)."""
    n = len(team_players)
    if n != 11:
        return False
    cost = np.full((11, 11), 1_000_000.0)
    for i, p in enumerate(team_players):
        for slot in range(1, 12):
            if p['minPos'] <= slot <= p['maxPos']:
                cost[i, slot - 1] = 0.0
    row, col = linear_sum_assignment(cost)
    return cost[row, col].sum() < 500_000.0


def build():
    all_players = compute_all_players()

    for rec in all_players:
        category = rec.get('role_category') or classify_role(rec['role'])
        rec['role_category'] = category
        flex = FLEX_TABLE[category]
        rec['minPos'] = max(1, rec['pos'] - flex)
        rec['maxPos'] = min(11, rec['pos'] + flex)
        rec['isKeeper'] = category == 'Wicketkeeper Batter'
        rec['roleBadge'] = BADGE_MAP[category]

    # ---- group into team-seasons, assign stable ids ----
    grouped = defaultdict(list)
    for rec in all_players:
        grouped[(rec['season'], rec['team'])].append(rec)

    keys = sorted(grouped.keys(), key=lambda k: (k[0], TEAMS.index(k[1]) if k[1] in TEAMS else 99))

    failures = []
    team_seasons = []
    player_counter = 0
    for t_idx, key in enumerate(keys):
        season, team = key
        players = sorted(grouped[key], key=lambda r: r['pos'])
        if not check_feasibility(players):
            failures.append((season, team, [(p['pos'], p['role_category'], p['minPos'], p['maxPos']) for p in players]))

        out_players = []
        for p in players:
            player_counter += 1
            out_players.append({
                'id': f'p{player_counter}',
                'name': p['name'],
                'role': p['role'],
                'roleCategory': p['role_category'],
                'roleBadge': p['roleBadge'],
                'canonicalPos': p['pos'],
                'minPos': p['minPos'],
                'maxPos': p['maxPos'],
                'isKeeper': p['isKeeper'],
                'isOverseas': p.get('isOverseas', False),
                'battingScore': p.get('BattingPower'),
                'finishingScore': p.get('FinishingPower'),
                'bowlingScore': p.get('BowlingScore'),
            })

        team_seasons.append({
            'id': f't{t_idx + 1}',
            'franchise': team,
            'season': season,
            'players': out_players,
        })

    return team_seasons, failures


def main():
    team_seasons, failures = build()

    if failures:
        print(f'INFEASIBLE team-seasons: {len(failures)} / {len(team_seasons)}', file=sys.stderr)
        for season, team, players in failures[:10]:
            print(f'  {team} {season}:', players, file=sys.stderr)
        if len(failures) > 10:
            print(f'  ... and {len(failures) - 10} more', file=sys.stderr)
    else:
        print(f'All {len(team_seasons)} team-seasons are individually feasible (perfect matching exists).')

    out_path = str(Path(__file__).resolve().parent.parent / "worker" / "src" / "data" / "game_data.json")
    with open(out_path, 'w') as f:
        json.dump(team_seasons, f, separators=(',', ':'))
    print('wrote', out_path, 'team-seasons:', len(team_seasons))

    import os
    print('file size (KB):', round(os.path.getsize(out_path) / 1024, 1))


if __name__ == '__main__':
    main()
