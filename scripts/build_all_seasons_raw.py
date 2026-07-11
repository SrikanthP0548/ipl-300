"""
Runs the Release 1A sample pipeline (sample_release1a.py) across every
season 2008-2026 and writes one combined CSV, so real candidate player-
seasons for the Release 1B benchmark set can be pulled from anywhere in
the dataset, not just one season at a time.

Diagnostic only - does not touch build_csv.py, build_game_json.py, or any
production output.
"""

import csv

from build_csv import FILES
from sample_release1a import main as run_season


def build():
    all_rows = []
    for season in sorted(FILES.keys()):
        rows = run_season(season)
        for r in rows:
            r['season'] = season
        all_rows.extend(rows)
    return all_rows


if __name__ == '__main__':
    rows = build()
    out_path = "/tmp/claude-0/-home-user-ipl-300/f3ec677b-388b-598c-a8d1-2914b979aaca/scratchpad/all_seasons_release1a.csv"
    with open(out_path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['Season', 'Name', 'Team', 'Role', 'BallsFaced', 'BallsBowled', 'Wickets',
                    'OLD_BattingScore', 'NEW_BattingRaw',
                    'OLD_FinishingScore', 'NEW_FinishingRaw',
                    'OLD_BowlingScore', 'NEW_BowlingRaw', 'NEW_EconomyRaw'])
        for r in rows:
            w.writerow([
                r['season'], r['name'], r['team'], r['role'], r['bf'], r['bb'], r['wkts'],
                r['old_bat'], round(r['new_bat_raw'], 4) if r['new_bat_raw'] is not None else '',
                r['old_fin'], round(r['new_fin_raw'], 4) if r['new_fin_raw'] is not None else '',
                r['old_bowl'],
                round(r['new_bowl_raw'], 4) if r['new_bowl_raw'] is not None else '',
                round(r['new_econ_raw'], 4) if r['new_econ_raw'] is not None else '',
            ])
    print('wrote', out_path, 'rows:', len(rows))
