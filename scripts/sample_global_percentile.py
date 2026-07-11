"""
Release 1B/2 sample: reproduces the methodology reverse-engineered from the
uploaded reference JSON (Score.json).

Reverse-engineered recipe (confirmed against the reference file, not guessed):

  1. QUALIFICATION: a player-season needs a minimum number of matches to be
     scored at all. Below the threshold it is simply excluded (this is why
     e.g. A Zampa 2016 RPS / B B McCullum 2008 KKR don't appear in the
     reference file at all - not a scoring quirk, an exclusion rule).

  2. ERA NORMALIZATION: adjusted_strike_rate / bat_strike_rate is an EXACT
     constant within each season (verified: min==max to 6 decimals across
     every player in a season, regardless of matches played) - i.e. there is
     NO per-player small-sample shrinkage in the reference file's "adjusted_*"
     fields at all. It's a flat per-season multiplier:
         adjusted_X(season) = raw_X * (league_avg_X[2026] / league_avg_X[season])
     2026 is the reference season (factor == 1.0 exactly). Older, lower-scoring
     seasons (e.g. 2009, played in South Africa on tougher pitches) get scaled
     up more. This is what stops modern high-scoring seasons from dominating
     the global percentile pool - confirmed by the season-mean SR staying flat
     (~145-155) across all 19 years in the reference data despite raw SR
     climbing from ~122 to ~147 over the same span.

  3. GLOBAL PERCENTILE: the era-adjusted rate is percentile-ranked across ALL
     19 seasons at once (confirmed earlier via regression: 0.02 mean error vs
     a global rank, 2.38 vs per-season).

  4. EXACT LINEAR COMBINATION (found via regression against the reference
     file, R^2 ~ 1):
         BattingPower = 0.6 * RunsPerMatchPct + 0.4 * StrikeRatePct
         POWER_SCORE  = 0.2 * RunsPerMatchPct + 0.4 * StrikeRatePct + 0.4 * BoundaryRatePct
         BowlingScore = 0.6 * WicketsPerMatchPct + 0.4 * EconomyPct
                         (pace and spin ranked in separate pools; economy inverted -
                          lower economy = higher percentile)

Below-cutoff players are NOT dropped here (unlike the reference file - see the
FALLBACK section below): our own source data is already a curated ~11-player
"Best XI" per team-season rather than a full squad, so dropping the same
players the reference file drops would sometimes leave a team-season with as
few as 8 draftable players. Instead, sub-threshold players get a FALLBACK
score: the same confidence-weighted shrinkage built and validated earlier in
sample_release1a.py (PRIOR_BALLS_BATTING=120, PRIOR_BALLS_BOWLING=72), blended
toward the reference season's own league average (which is already on the
correct era-adjusted scale, so no separate era-normalization step is needed
for the blend target), then ranked in the exact same percentile pool as
everyone else. Confidence shrinks to ~0 for very small samples, which pulls
those players toward a middling/conservative score rather than an extreme one
- this is what resolves the "should Zampa/McCullum be conservative" question
from earlier: yes, but via shrinkage of the input, not a manual override of
the output.

Diagnostic only - does not touch build_csv.py, build_game_json.py, or any
production output.

Usage: python3 sample_global_percentile.py [season]   (defaults to 2008)
"""

import bisect
import csv
import statistics
import sys
from collections import defaultdict

from build_csv import FILES, TEAMS, compute_all_players, to_int
from sample_release1a import PRIOR_BALLS_BATTING, PRIOR_BALLS_BOWLING, load_season

REFERENCE_SEASON = 2026
# Exact cutoffs confirmed against the reference file: minimum matches for a
# player-season to appear in the roster at all is 6 (verified - the file's
# global minimum bat_matches/bowl_matches is exactly 6, and our own 2008 data
# shows Hussey/McCullum/Hayden all sitting at exactly 4 matches, which is why
# they're absent from the reference file). Minimum balls faced for a batting
# score to be computed is 50 (verified exactly - lowest scored player had 50
# BF, highest unscored had 49). Bowling balls cutoff is less clean in the
# reference data (role-routing noise between pace/spin scores muddies it), so
# 120 balls (20 overs) is used as a reasonable, round equivalent.
MIN_MATCHES_BAT = 6
MIN_MATCHES_BOWL = 6
MIN_BALLS_FACED = 50
MIN_BALLS_BOWLED = 120


def load_all_seasons():
    all_players = []
    for season in sorted(FILES.keys()):
        players = load_season(season)
        for p in players:
            p['_bat']['mat'] = to_int(p.get('bat_mat')) or 0
            p['_bat']['fours'] = to_int(p.get('bat_fours')) or 0
            p['_bowl']['mat'] = to_int(p.get('bowl_mat')) or 0
            p['_is_spin'] = 'spin' in (p.get('role') or '').lower()
            all_players.append(p)
    return all_players


def qualifies_bat(p):
    bat = p['_bat']
    return (bat['mat'] >= MIN_MATCHES_BAT and bat['bf'] >= MIN_BALLS_FACED
            and bat['sr'] is not None and bat['inns'] > 0)


def qualifies_bowl(p):
    bowl = p['_bowl']
    return (bowl['mat'] >= MIN_MATCHES_BOWL and bowl['overs_balls'] >= MIN_BALLS_BOWLED
            and bowl['runsconceded'] is not None)


def league_averages_by_season(players):
    """Unweighted mean of each raw rate among QUALIFYING players, per season."""
    by_season_bat = defaultdict(list)
    by_season_bowl_pace = defaultdict(list)
    by_season_bowl_spin = defaultdict(list)

    for p in players:
        if qualifies_bat(p):
            bat = p['_bat']
            rpm = bat['runs'] / bat['mat']
            sr = bat['sr']
            bnd = (bat['fours'] + bat['sixes']) / bat['bf'] * 100
            by_season_bat[p['season']].append((rpm, sr, bnd))
        if qualifies_bowl(p):
            bowl = p['_bowl']
            wpm = bowl['wickets'] / bowl['mat']
            econ = bowl['runsconceded'] / (bowl['overs_balls'] / 6)
            bucket = by_season_bowl_spin if p['_is_spin'] else by_season_bowl_pace
            bucket[p['season']].append((wpm, econ))

    avg_bat = {}
    for s, rows in by_season_bat.items():
        avg_bat[s] = dict(
            rpm=statistics.mean(r[0] for r in rows),
            sr=statistics.mean(r[1] for r in rows),
            bnd=statistics.mean(r[2] for r in rows),
        )
    avg_bowl_pace = {}
    for s, rows in by_season_bowl_pace.items():
        avg_bowl_pace[s] = dict(wpm=statistics.mean(r[0] for r in rows), econ=statistics.mean(r[1] for r in rows))
    avg_bowl_spin = {}
    for s, rows in by_season_bowl_spin.items():
        avg_bowl_spin[s] = dict(wpm=statistics.mean(r[0] for r in rows), econ=statistics.mean(r[1] for r in rows))

    return avg_bat, avg_bowl_pace, avg_bowl_spin


class Percentiles:
    def __init__(self, values):
        self.sorted = sorted(values)
        self.sorted_neg = sorted(-x for x in self.sorted)
        self.n = len(self.sorted)

    def of(self, value, higher_is_better=True):
        if value is None or self.n <= 1:
            return None
        pool = self.sorted if higher_is_better else self.sorted_neg
        v = value if higher_is_better else -value
        lo = bisect.bisect_left(pool, v)
        hi = bisect.bisect_right(pool, v)
        rank = (lo + hi - 1) / 2
        return rank / (self.n - 1) * 100


def build():
    players = load_all_seasons()
    avg_bat, avg_bowl_pace, avg_bowl_spin = league_averages_by_season(players)
    ref_bat = avg_bat[REFERENCE_SEASON]
    ref_pace = avg_bowl_pace[REFERENCE_SEASON]
    ref_spin = avg_bowl_spin[REFERENCE_SEASON]

    for p in players:
        p['_adj_rpm'] = p['_adj_sr'] = p['_adj_bnd'] = None
        p['_adj_wpm'] = p['_adj_econ'] = None
        p['_qual_bat'] = qualifies_bat(p)
        p['_qual_bowl'] = qualifies_bowl(p)
        p['_fallback_bat'] = p['_fallback_bowl'] = False

        bat = p['_bat']
        if bat['bf'] > 0 and bat['sr'] is not None and bat['inns'] > 0 and p['season'] in avg_bat and bat['mat'] > 0:
            s_avg = avg_bat[p['season']]
            rpm = bat['runs'] / bat['mat']
            sr = bat['sr']
            bnd = (bat['fours'] + bat['sixes']) / bat['bf'] * 100
            adj_rpm = rpm * (ref_bat['rpm'] / s_avg['rpm'])
            adj_sr = sr * (ref_bat['sr'] / s_avg['sr'])
            adj_bnd = bnd * (ref_bat['bnd'] / s_avg['bnd'])
            if p['_qual_bat']:
                p['_adj_rpm'], p['_adj_sr'], p['_adj_bnd'] = adj_rpm, adj_sr, adj_bnd
            else:
                # FALLBACK: shrink toward the reference season's own league
                # average (already era-adjusted scale) instead of dropping.
                conf = bat['bf'] / (bat['bf'] + PRIOR_BALLS_BATTING)
                p['_adj_rpm'] = conf * adj_rpm + (1 - conf) * ref_bat['rpm']
                p['_adj_sr'] = conf * adj_sr + (1 - conf) * ref_bat['sr']
                p['_adj_bnd'] = conf * adj_bnd + (1 - conf) * ref_bat['bnd']
                p['_fallback_bat'] = True

        avg_pool = avg_bowl_spin if p['_is_spin'] else avg_bowl_pace
        ref_pool = ref_spin if p['_is_spin'] else ref_pace
        bowl = p['_bowl']
        if bowl['overs_balls'] > 0 and bowl['runsconceded'] is not None and p['season'] in avg_pool and bowl['mat'] > 0:
            s_avg = avg_pool[p['season']]
            wpm = bowl['wickets'] / bowl['mat']
            econ = bowl['runsconceded'] / (bowl['overs_balls'] / 6)
            adj_wpm = wpm * (ref_pool['wpm'] / s_avg['wpm'])
            adj_econ = econ * (ref_pool['econ'] / s_avg['econ'])
            if p['_qual_bowl']:
                p['_adj_wpm'], p['_adj_econ'] = adj_wpm, adj_econ
            else:
                conf = bowl['overs_balls'] / (bowl['overs_balls'] + PRIOR_BALLS_BOWLING)
                p['_adj_wpm'] = conf * adj_wpm + (1 - conf) * ref_pool['wpm']
                p['_adj_econ'] = conf * adj_econ + (1 - conf) * ref_pool['econ']
                p['_fallback_bowl'] = True

    # ---- global percentile pools (all 19 seasons pooled) ----
    # Pools are built from QUALIFYING players only, matching the reference
    # file's own denominator. Fallback (shrunk) players are ranked against
    # this pool afterwards - they don't get to widen/shift it themselves.
    rpm_pool = Percentiles([p['_adj_rpm'] for p in players if p['_adj_rpm'] is not None and p['_qual_bat']])
    sr_pool = Percentiles([p['_adj_sr'] for p in players if p['_adj_sr'] is not None and p['_qual_bat']])
    bnd_pool = Percentiles([p['_adj_bnd'] for p in players if p['_adj_bnd'] is not None and p['_qual_bat']])
    pace_wpm_pool = Percentiles([p['_adj_wpm'] for p in players if p['_adj_wpm'] is not None and p['_qual_bowl'] and not p['_is_spin']])
    pace_econ_pool = Percentiles([p['_adj_econ'] for p in players if p['_adj_econ'] is not None and p['_qual_bowl'] and not p['_is_spin']])
    spin_wpm_pool = Percentiles([p['_adj_wpm'] for p in players if p['_adj_wpm'] is not None and p['_qual_bowl'] and p['_is_spin']])
    spin_econ_pool = Percentiles([p['_adj_econ'] for p in players if p['_adj_econ'] is not None and p['_qual_bowl'] and p['_is_spin']])

    for p in players:
        rpm_pct = rpm_pool.of(p['_adj_rpm'])
        sr_pct = sr_pool.of(p['_adj_sr'])
        bnd_pct = bnd_pool.of(p['_adj_bnd'])
        p['BattingPower'] = round(0.6 * rpm_pct + 0.4 * sr_pct, 1) if None not in (rpm_pct, sr_pct) else None
        p['PowerScore'] = (
            round(0.2 * rpm_pct + 0.4 * sr_pct + 0.4 * bnd_pct, 1)
            if None not in (rpm_pct, sr_pct, bnd_pct) else None
        )

        if p['_is_spin']:
            wpm_pct = spin_wpm_pool.of(p['_adj_wpm'])
            econ_pct = spin_econ_pool.of(p['_adj_econ'], higher_is_better=False)
        else:
            wpm_pct = pace_wpm_pool.of(p['_adj_wpm'])
            econ_pct = pace_econ_pool.of(p['_adj_econ'], higher_is_better=False)
        p['BowlingScore'] = round(0.6 * wpm_pct + 0.4 * econ_pct, 1) if None not in (wpm_pct, econ_pct) else None

    return players


def main(season_year):
    players = build()
    old_players = {(p['name'], p['team']): p for p in compute_all_players() if p['season'] == season_year}

    rows = []
    for p in players:
        if p['season'] != season_year:
            continue
        old = old_players.get((p['name'], p['team']))
        rows.append(dict(
            name=p['name'], team=p['team'], role=p['role'],
            bf=p['_bat']['bf'], mat_bat=p['_bat']['mat'],
            bb=p['_bowl']['overs_balls'], mat_bowl=p['_bowl']['mat'], wkts=p['_bowl']['wickets'],
            qual_bat=p['_qual_bat'], qual_bowl=p['_qual_bowl'],
            fallback_bat=p['_fallback_bat'], fallback_bowl=p['_fallback_bowl'],
            old_bat=old['BattingPower'] if old else None,
            old_fin=old['FinishingPower'] if old else None,
            old_bowl=old['BowlingScore'] if old else None,
            new_bat=p['BattingPower'], new_power=p['PowerScore'], new_bowl=p['BowlingScore'],
        ))
    return rows, players


if __name__ == '__main__':
    season_arg = int(sys.argv[1]) if len(sys.argv) > 1 else 2008
    rows, all_players = main(season_arg)

    out_path = f"/tmp/claude-0/-home-user-ipl-300/f3ec677b-388b-598c-a8d1-2914b979aaca/scratchpad/{season_arg}_global_percentile_comparison.csv"
    with open(out_path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['Name', 'Team', 'Role', 'MatchesBat', 'BallsFaced', 'QualBat', 'FallbackBat',
                    'MatchesBowl', 'BallsBowled', 'Wickets', 'QualBowl', 'FallbackBowl',
                    'OLD_BattingScore', 'NEW_BattingPower',
                    'OLD_FinishingScore', 'NEW_PowerScore',
                    'OLD_BowlingScore', 'NEW_BowlingScore'])
        for r in sorted(rows, key=lambda r: -(r['new_bat'] or r['new_bowl'] or 0)):
            w.writerow([
                r['name'], r['team'], r['role'], r['mat_bat'], r['bf'], r['qual_bat'], r['fallback_bat'],
                r['mat_bowl'], r['bb'], r['wkts'], r['qual_bowl'], r['fallback_bowl'],
                r['old_bat'], r['new_bat'],
                r['old_fin'], r['new_power'],
                r['old_bowl'], r['new_bowl'],
            ])
    print('wrote', out_path)

    by_season_bat = defaultdict(list)
    by_season_bowl = defaultdict(list)
    for p in all_players:
        if p['BattingPower'] is not None:
            by_season_bat[p['season']].append(p['BattingPower'])
        if p['BowlingScore'] is not None:
            by_season_bowl[p['season']].append(p['BowlingScore'])
    print()
    print('BATTING 90+ counts by season (era-normalized + global percentile):')
    for s in sorted(by_season_bat):
        vals = by_season_bat[s]
        print(f"  {s}: n={len(vals)} 90+={sum(1 for v in vals if v>=90)} 85+={sum(1 for v in vals if v>=85)}")
    print()
    print('BOWLING 90+ counts by season (era-normalized + global percentile):')
    for s in sorted(by_season_bowl):
        vals = by_season_bowl[s]
        print(f"  {s}: n={len(vals)} 90+={sum(1 for v in vals if v>=90)} 85+={sum(1 for v in vals if v>=85)}")

    fallback = [p for p in all_players if p['season'] == season_arg and (p['_fallback_bat'] or p['_fallback_bowl'])]
    print()
    print(f'{season_arg}: {len(fallback)} players on the FALLBACK (shrunk-toward-baseline) path:')
    for p in fallback:
        print(' ', p['name'], p['team'], 'bat_mat=', p['_bat']['mat'], 'bowl_mat=', p['_bowl']['mat'],
              'BattingPower=', p['BattingPower'], 'PowerScore=', p['PowerScore'], 'BowlingScore=', p['BowlingScore'])
