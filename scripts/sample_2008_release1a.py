"""
One-off Release 1A sample: apply the agreed new pipeline (leave-one-out
baselines, balls-based confidence shrinkage on rates, no percentile
normalization, no role-floor shrinkage) to 2008 ONLY, and print it next to
the current production scores for comparison.

Does not touch build_csv.py, build_game_json.py, or any production output.
Interpretive calls I made that weren't pinned down in the design discussion
(flagged in the summary at the bottom too):

  - The old innings-based `Availability` multiplier (batting) and
    `finishing_sample` term are DROPPED, on the reasoning that the new
    balls-based rate shrinkage already answers "how much do we trust this
    rate" — keeping Availability too would reintroduce the same
    double-confidence stacking problem we just removed from role-floor
    shrinkage, just relocated.
  - Likewise, bowling's `Availability` (innings-based) and `OversFactor`
    (balls-based, but a scalar multiplier on the raw score rather than a
    shrinkage of the rate) are DROPPED for the same reason — the new
    wicket-rate/economy shrinkage already discounts small samples at the
    input, so scaling the output too would double-count balls-bowled.
  - `Consistency` (fifties/hundreds bonus, four-wicket-haul bonus) is KEPT
    unchanged, per the design note that raw formulas should stay close to
    current and only swap in shrunk rates.
  - Shrinkage target is the LOO SEASON baseline (broad prior); the LOO
    TEAM baseline is used only in the existing 0.70/0.30 ratio-adjustment
    step, mirroring how the original AdjustedSRIndex/AdjStrike/AdjAvg/
    AdjEcon were structured.
  - No Release 1B calibration exists yet, so "NEW" values below are raw,
    unscaled quality figures, not final 0-100 scores. A simple per-metric
    min-max rescale (this file's data only) is added purely so the shape
    is eyeballable — it is NOT a stand-in for real calibration.
"""

import math
from pathlib import Path

from build_csv import (
    REPO, FILES, TEAMS, extract_players, build_player_metrics, compute_all_players,
)

PRIOR_BALLS_BATTING = 120.0
# 12 overs. Tested against 48/72/96/120/144: 72 is where single-over flukes
# (e.g. 1 wicket for 3 runs off one over) stop ranking near the top of the
# bowling pool; beyond ~96 there's no further improvement (a real property
# of confidence-weighted shrinkage, not a tuning gap — see the 2008 sample
# investigation), so no benefit to going higher.
PRIOR_BALLS_BOWLING = 72.0
MIN_TEAM_BALLS_FOR_LOO = 20  # fallback to season baseline below this


def load_2008():
    text = (REPO / FILES[2008]).read_text()
    raw = extract_players(text, 2008)
    for rec in raw:
        m, bm = build_player_metrics(rec)
        rec['_bat'] = m
        rec['_bowl'] = bm
    return raw


def season_totals(players):
    tot_runs = sum(p['_bat']['runs'] for p in players)
    tot_bf = sum(p['_bat']['bf'] for p in players)
    tot_inns = sum(p['_bat']['inns'] for p in players)
    tot_no = sum(p['_bat']['no'] for p in players)
    tot_sixes = sum(p['_bat']['sixes'] for p in players)
    tot_rc = sum(p['_bowl']['runsconceded'] or 0 for p in players if p['_bowl']['overs_balls'] > 0)
    tot_bb = sum(p['_bowl']['overs_balls'] for p in players)
    tot_wk = sum(p['_bowl']['wickets'] for p in players)
    return dict(runs=tot_runs, bf=tot_bf, inns=tot_inns, no=tot_no, sixes=tot_sixes,
                rc=tot_rc, bb=tot_bb, wk=tot_wk)


def team_totals(players, team):
    return season_totals([p for p in players if p['team'] == team])


def loo_batting_baseline(totals, player, min_pool_balls=MIN_TEAM_BALLS_FOR_LOO):
    bf = totals['bf'] - player['_bat']['bf']
    runs = totals['runs'] - player['_bat']['runs']
    if bf < min_pool_balls:
        return None
    return (runs / bf) * 100


def loo_batting_per_innings_baselines(totals, player, min_pool_innings=5):
    """Season LOO baselines for the per-innings ratios that feed BattingPowerRaw/
    FinishingPowerRaw: runs/inn, not-outs/inn, sixes/inn, balls/inn."""
    inns = totals['inns'] - player['_bat']['inns']
    if inns < min_pool_innings:
        return None
    runs = totals['runs'] - player['_bat']['runs']
    no = totals['no'] - player['_bat']['no']
    sixes = totals['sixes'] - player['_bat']['sixes']
    bf = totals['bf'] - player['_bat']['bf']
    return dict(
        runs_per_inn=runs / inns,
        not_out_rate=no / inns,
        sixes_per_inn=sixes / inns,
        balls_per_inn=bf / inns,
    )


def loo_bowling_baseline(totals, player, min_pool_balls=MIN_TEAM_BALLS_FOR_LOO):
    bb = totals['bb'] - player['_bowl']['overs_balls']
    rc = totals['rc'] - (player['_bowl']['runsconceded'] or 0 if player['_bowl']['overs_balls'] > 0 else 0)
    wk = totals['wk'] - player['_bowl']['wickets']
    if bb < min_pool_balls or wk <= 0:
        return None
    economy = rc / (bb / 6)
    wicket_rate = wk / bb
    bowl_avg = rc / wk
    bowl_sr = bb / wk
    return dict(economy=economy, wicket_rate=wicket_rate, avg=bowl_avg, sr=bowl_sr)


def new_batting_raw(player, season_loo_sr, team_loo_sr, season_loo_per_inn):
    bat = player['_bat']
    if bat['inns'] <= 0 or bat['sr'] is None or bat['bf'] <= 0:
        return None, None
    confidence = bat['bf'] / (bat['bf'] + PRIOR_BALLS_BATTING)
    shrunk_sr = confidence * bat['sr'] + (1 - confidence) * season_loo_sr

    team_ref = team_loo_sr if team_loo_sr is not None else season_loo_sr
    adjusted_sr_index = 0.70 * (shrunk_sr / season_loo_sr) + 0.30 * (shrunk_sr / team_ref)

    # Every per-innings ratio below is computed from the same small sample
    # (Innings) as runs_per_inn was — shrink all of them with the same
    # BallsFaced-based confidence before they feed the raw formulas, rather
    # than singling out runs_per_inn. This is what replaces FinishSample's
    # old (crude) role.
    observed_runs_per_inn = bat['runs'] / bat['inns']
    observed_not_out_rate = bat['no'] / bat['inns']
    observed_sixes_per_inn = bat['sixes'] / bat['inns']
    observed_balls_per_inn = (bat['bf'] / bat['inns']) if bat['bf'] else None

    if season_loo_per_inn is not None:
        runs_per_inn = confidence * observed_runs_per_inn + (1 - confidence) * season_loo_per_inn['runs_per_inn']
        not_out_rate = confidence * observed_not_out_rate + (1 - confidence) * season_loo_per_inn['not_out_rate']
        sixes_per_inn = confidence * observed_sixes_per_inn + (1 - confidence) * season_loo_per_inn['sixes_per_inn']
        balls_per_inn = (
            confidence * observed_balls_per_inn + (1 - confidence) * season_loo_per_inn['balls_per_inn']
            if observed_balls_per_inn is not None else None
        )
    else:
        runs_per_inn, not_out_rate, sixes_per_inn, balls_per_inn = (
            observed_runs_per_inn, observed_not_out_rate, observed_sixes_per_inn, observed_balls_per_inn,
        )

    consistency = 1 + (bat['fifties'] * 0.04) + (bat['hundreds'] * 0.08)
    batting_raw = runs_per_inn * adjusted_sr_index * consistency

    not_out_idx = 1 + min(0.30, not_out_rate)
    boundary_idx = 1 + min(0.30, sixes_per_inn * 0.06)
    ball_eff_idx = 1 + min(0.20, max(0.0, (25 - balls_per_inn) / 50)) if balls_per_inn is not None else 1.0
    finishing_raw = math.sqrt(max(0.0, runs_per_inn)) * adjusted_sr_index * not_out_idx * boundary_idx * ball_eff_idx

    return batting_raw, finishing_raw


def new_bowling_raw(player, season_loo, team_loo):
    bowl = player['_bowl']
    if bowl['overs_balls'] <= 0:
        return None, None

    confidence = bowl['overs_balls'] / (bowl['overs_balls'] + PRIOR_BALLS_BOWLING)
    observed_wicket_rate = bowl['wickets'] / bowl['overs_balls']
    observed_economy = (bowl['runsconceded'] / (bowl['overs_balls'] / 6)) if bowl['runsconceded'] is not None else None
    if observed_economy is None:
        return None, None

    shrunk_wicket_rate = confidence * observed_wicket_rate + (1 - confidence) * season_loo['wicket_rate']
    shrunk_economy = confidence * observed_economy + (1 - confidence) * season_loo['economy']

    # Zero-wicket-safe average: blend pseudo-observations toward the season baseline
    # rather than dividing by (possibly zero) actual wickets.
    prior_wickets = PRIOR_BALLS_BOWLING * season_loo['wicket_rate']
    prior_runs = (PRIOR_BALLS_BOWLING / 6) * season_loo['economy']
    shrunk_bowl_avg = (bowl['runsconceded'] + prior_runs) / (bowl['wickets'] + prior_wickets)
    shrunk_bowl_sr = 1 / shrunk_wicket_rate

    team_ref = team_loo if team_loo is not None else season_loo
    adj_strike = 0.70 * (season_loo['sr'] / shrunk_bowl_sr) + 0.30 * (team_ref['sr'] / shrunk_bowl_sr)
    adj_avg = 0.70 * (season_loo['avg'] / shrunk_bowl_avg) + 0.30 * (team_ref['avg'] / shrunk_bowl_avg)
    adj_econ = 0.70 * (season_loo['economy'] / shrunk_economy) + 0.30 * (team_ref['economy'] / shrunk_economy)

    consistency = 1 + (bowl['fourw'] * 0.08)
    bowling_raw = shrunk_wicket_rate * (adj_strike ** 0.60) * (adj_avg ** 0.40) * consistency

    wicket_bonus = 1 + min(0.15, shrunk_wicket_rate * 6 * 0.10)  # per-over wicket rate, same shape as before
    economy_raw = math.sqrt(max(0.0, adj_econ)) * wicket_bonus

    return bowling_raw, economy_raw


def rescale(values, lo=25, hi=99):
    valid = [v for v in values if v is not None]
    if not valid:
        return lambda v: None
    vmin, vmax = min(valid), max(valid)

    def f(v):
        if v is None or vmax == vmin:
            return None
        return round(lo + (hi - lo) * (v - vmin) / (vmax - vmin), 1)

    return f


def main():
    players = load_2008()
    season = season_totals(players)
    season_sr = (season['runs'] / season['bf']) * 100
    season_econ = season['rc'] / (season['bb'] / 6)
    season_wk_rate = season['wk'] / season['bb']
    season_avg = season['rc'] / season['wk']
    season_bowl_sr = season['bb'] / season['wk']
    season_loo_bowl = dict(economy=season_econ, wicket_rate=season_wk_rate, avg=season_avg, sr=season_bowl_sr)

    team_tot = {t: team_totals(players, t) for t in TEAMS if any(p['team'] == t for p in players)}

    old_players = {(p['name'], p['team']): p for p in compute_all_players() if p['season'] == 2008}

    rows = []
    for p in players:
        key = (p['name'], p['team'])
        old = old_players.get(key)

        season_loo_sr = loo_batting_baseline(season, p)
        tt = team_tot[p['team']]
        team_loo_sr = loo_batting_baseline(tt, p)
        season_loo_per_inn = loo_batting_per_innings_baselines(season, p)
        new_bat_raw, new_fin_raw = (None, None)
        if season_loo_sr:
            new_bat_raw, new_fin_raw = new_batting_raw(p, season_loo_sr, team_loo_sr, season_loo_per_inn)

        team_loo_bowl = loo_bowling_baseline(tt, p)
        new_bowl_raw, new_econ_raw = new_bowling_raw(p, season_loo_bowl, team_loo_bowl)

        rows.append(dict(
            name=p['name'], team=p['team'], role=p['role'],
            bf=p['_bat']['bf'], bb=p['_bowl']['overs_balls'], wkts=p['_bowl']['wickets'],
            old_bat=old['BattingPower'] if old else None,
            old_fin=old['FinishingPower'] if old else None,
            old_bowl=old['BowlingScore'] if old else None,
            new_bat_raw=new_bat_raw, new_fin_raw=new_fin_raw,
            new_bowl_raw=new_bowl_raw, new_econ_raw=new_econ_raw,
        ))

    bat_scaler = rescale([r['new_bat_raw'] for r in rows])
    fin_scaler = rescale([r['new_fin_raw'] for r in rows])
    # combine bowl+econ raw into one illustrative bowling figure the same way BOWLING_SCORE does (geometric-ish)
    bowl_combo = []
    for r in rows:
        if r['new_bowl_raw'] is not None and r['new_econ_raw'] is not None:
            bowl_combo.append(r['new_bowl_raw'] * (r['new_econ_raw'] ** 0.5))
        else:
            bowl_combo.append(None)
    bowl_scaler = rescale(bowl_combo)
    for r, combo in zip(rows, bowl_combo):
        r['new_bat_illustrative'] = bat_scaler(r['new_bat_raw'])
        r['new_fin_illustrative'] = fin_scaler(r['new_fin_raw'])
        r['new_bowl_illustrative'] = bowl_scaler(combo)

    return rows


def fmt(v):
    return '-' if v is None else f'{v:.1f}'


if __name__ == '__main__':
    import csv

    rows = main()
    out_path = "/tmp/claude-0/-home-user-ipl-300/f3ec677b-388b-598c-a8d1-2914b979aaca/scratchpad/2008_release1a_comparison.csv"
    with open(out_path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['Name', 'Team', 'Role', 'BallsFaced', 'BallsBowled', 'Wickets',
                    'OLD_BattingScore', 'NEW_BattingRaw', 'NEW_BattingIllustrative',
                    'OLD_FinishingScore', 'NEW_FinishingRaw', 'NEW_FinishingIllustrative',
                    'OLD_BowlingScore', 'NEW_BowlingIllustrative'])
        for r in sorted(rows, key=lambda r: -(r['old_bowl'] or r['old_bat'] or 0)):
            w.writerow([
                r['name'], r['team'], r['role'], r['bf'], r['bb'], r['wkts'],
                r['old_bat'], round(r['new_bat_raw'], 4) if r['new_bat_raw'] is not None else '', r['new_bat_illustrative'],
                r['old_fin'], round(r['new_fin_raw'], 4) if r['new_fin_raw'] is not None else '', r['new_fin_illustrative'],
                r['old_bowl'], r['new_bowl_illustrative'],
            ])
    print('wrote', out_path)
