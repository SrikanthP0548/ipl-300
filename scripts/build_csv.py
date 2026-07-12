import json, re, csv, bisect, statistics
from collections import defaultdict
from pathlib import Path

REPO = Path("/home/user/ipl-300")

# name|team|season -> is this player-season an overseas signing? Sourced from
# a reference dataset with real nationality data (95.1% direct match); the
# remainder (mostly small-sample player-seasons excluded from that reference
# entirely) were classified by hand.
with open(Path(__file__).resolve().parent / "overseas_lookup.json") as _f:
    OVERSEAS_LOOKUP = json.load(_f)

FILES = {
    2008: "ipl_2008_team_best_xi.md",
    2009: "ipl_2009_team_best_xi_role_based.md",
    2010: "ipl_2010_team_best_xi_role_based.md",
    2011: "ipl_2011_team_best_xi_role_based.md",
    2012: "ipl_2012_team_best_xi_role_based.md",
    2013: "ipl_2013_team_best_xi_role_based_complete_fields.md",
    2014: "ipl_2014_team_best_xi_role_based.md",
    2015: "ipl_2015_team_best_xi_role_based.md",
    2016: "ipl_2016_team_best_xi_role_based_complete_fields.md",
    2017: "ipl_2017_team_best_xi_role_based.md",
    2018: "ipl_2018_team_best_xi_role_based_complete_fields.md",
    2019: "ipl_2019_team_best_xi_role_based.md",
    2020: "ipl_2020_team_best_xi_role_based_complete_fields.md",
    2021: "ipl_2021_team_best_xi_role_based.md",
    2022: "ipl_2022_team_best_xi_role_based.md",
    2023: "ipl_2023_team_best_xi_role_based.md",
    2024: "ipl_2024_team_best_xi_role_based.md",
    2025: "ipl_2025_team_best_xi_role_based.md",
    2026: "ipl_2026_team_best_xi_role_based.md",
}

TEAMS = [
    "Chennai Super Kings", "Deccan Chargers", "Delhi Capitals", "Gujarat Lions",
    "Gujarat Titans", "Kochi Tuskers Kerala", "Kolkata Knight Riders",
    "Lucknow Super Giants", "Mumbai Indians", "Pune Warriors", "Punjab Kings",
    "Rajasthan Royals", "Rising Pune Supergiant", "Royal Challengers Bengaluru",
    "Sunrisers Hyderabad",
]

BAT_ALIASES = {
    'mat': 'mat', 'inns': 'inns', 'no': 'no', '50s': 'fifties', '100s': 'hundreds',
    '0s': 'ducks', '4s': 'fours', '6s': 'sixes', 'hs': 'hs', 'runs': 'runs',
    'bf': 'bf', 'sr': 'sr', 'avg': 'avg', 'ca': 'ca', 'st': 'st',
}
BOWL_ALIASES = {
    'mat': 'mat', 'inns': 'inns', 'o': 'overs', 'overs': 'overs', 'm': 'maidens',
    'r': 'runsconceded', 'runs': 'runsconceded', 'w': 'wickets', 'wkts': 'wickets',
    'best': 'best', '4w': 'fourw', 'avg': 'avg', 'sr': 'sr', 'er': 'econ', 'econ': 'econ',
}


def norm(h):
    h = h.strip().lower()
    if h.startswith('bat '):
        h = h[4:]
    if h.startswith('bowl '):
        h = h[5:]
    h = h.replace('/', '').replace('%', '').strip()
    return h


def overs_to_balls(s):
    """Cricket overs notation: 4.5 = 4 overs + 5 balls = 29 balls, not 4.5 decimal overs."""
    s = (s or '').strip()
    if not s:
        return None
    try:
        if '.' in s:
            whole, frac = s.split('.', 1)
            whole = int(whole) if whole else 0
            balls = int(frac[0]) if frac else 0
        else:
            whole = int(s)
            balls = 0
        return whole * 6 + balls
    except ValueError:
        return None


def to_float(s):
    s = (s or '').strip().replace('%', '').replace('*', '')
    if s == '' or s == '-':
        return None
    try:
        return float(s)
    except ValueError:
        return None


def to_int(s):
    v = to_float(s)
    return int(v) if v is not None else None


def parse_table(lines, start_idx):
    """Given lines and the index of the header row, return (header_cells, data_rows, next_idx)."""
    header = [c.strip() for c in lines[start_idx].strip().strip('|').split('|')]
    i = start_idx + 2  # skip header + separator
    rows = []
    while i < len(lines):
        line = lines[i].strip()
        if not line.startswith('|'):
            break
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if len(cells) == len(header):
            rows.append(cells)
        i += 1
    return header, rows, i


def find_bowl_start(header_norm):
    for idx, h in enumerate(header_norm):
        raw = h
        if raw in ('mat', 'inns', 'o', 'overs', 'm', 'r', 'runs', 'w', 'wkts', 'best', '4w', 'avg', 'sr', 'er', 'econ'):
            continue
    return None


def classify_columns(header):
    """Return (role_idx, player_idx, bat_map, bowl_map) where *_map: canonical_field -> column_idx."""
    role_idx = player_idx = None
    for idx, h in enumerate(header):
        hl = h.strip().lower()
        if hl == 'role':
            role_idx = idx
        elif hl == 'player':
            player_idx = idx
    # find where bowling columns start: first column (after player_idx) whose raw name starts with "bowl"
    bowl_start = None
    for idx, h in enumerate(header):
        if idx <= player_idx:
            continue
        if h.strip().lower().startswith('bowl'):
            bowl_start = idx
            break
    if bowl_start is None:
        bowl_start = len(header)

    bat_map, bowl_map = {}, {}
    for idx, h in enumerate(header):
        if idx <= player_idx or idx == role_idx:
            continue
        n = norm(h)
        if idx < bowl_start:
            if n in BAT_ALIASES:
                bat_map[BAT_ALIASES[n]] = idx
        else:
            if n in BOWL_ALIASES:
                bowl_map[BOWL_ALIASES[n]] = idx
    return role_idx, player_idx, bat_map, bowl_map


def extract_players(text, season):
    lines = text.split('\n')
    team_blocks = []  # (team_name, start_line_idx, end_line_idx)
    header_re = re.compile(r'^(#{2,3})\s+(.*)$')
    matches = []
    for i, line in enumerate(lines):
        m = header_re.match(line.strip())
        if m:
            matches.append((i, m.group(2).strip()))
    for idx, (line_i, title) in enumerate(matches):
        team_name = None
        for t in TEAMS:
            if title == t or title.startswith(t + ' '):
                team_name = t
                break
        if team_name is None:
            continue
        end = matches[idx + 1][0] if idx + 1 < len(matches) else len(lines)
        team_blocks.append((team_name, line_i, end))

    players = []
    for team_name, start, end in team_blocks:
        block = lines[start:end]
        header_idx = None
        for i, line in enumerate(block):
            if line.strip().startswith('|') and 'player' in line.lower():
                header_idx = i
                break
        if header_idx is None:
            continue
        header, rows, _ = parse_table(block, header_idx)
        role_idx, player_idx, bat_map, bowl_map = classify_columns(header)
        if player_idx is None:
            continue
        for pos, row in enumerate(rows, start=1):
            name = row[player_idx]
            role = row[role_idx] if role_idx is not None else ''
            rec = {
                'season': season, 'team': team_name, 'pos': pos, 'name': name, 'role': role,
            }
            for field, ci in bat_map.items():
                rec['bat_' + field] = row[ci]
            for field, ci in bowl_map.items():
                rec['bowl_' + field] = row[ci]
            players.append(rec)
    return players


# Scoring methodology (Release 1B): reverse-engineered from a reference dataset
# built the same way this game's data is - real IPL history, per-season stats.
# Confirmed by regression against that reference (R^2 ~ 1, not approximate):
#   BattingPower  = 0.6 * RunsPerMatchPercentile + 0.4 * StrikeRatePercentile
#   FinishingPower = 0.2 * RunsPerMatchPercentile + 0.4 * StrikeRatePercentile + 0.4 * BoundaryRatePercentile
#   BowlingScore  = 0.6 * WicketsPerMatchPercentile + 0.4 * EconomyPercentile
#                   (pace and spin bowlers ranked in separate pools; economy inverted)
# Percentiles are GLOBAL across all seasons (not per-season - a per-season pool
# manufactures the same "elite quota" every year regardless of the actual talent
# distribution that year, which was the root defect in the old formulas below).
# Each player's raw rate is first era-normalized (raw * league_avg[2026] /
# league_avg[own season]) so older, lower-scoring seasons aren't systematically
# buried by seasons where T20 scoring is simply higher.
#
# Player-seasons below the qualification cutoffs (too few matches/balls to
# trust the rate) don't get dropped - since this game's source data is already
# a curated ~11-player "Best XI" per team-season rather than a full squad,
# dropping them would leave some team-seasons short of a full XI. Instead they
# get a confidence-weighted shrinkage fallback (same technique, blended toward
# the reference season's league average) before being ranked in the same pool.
REFERENCE_SEASON = 2026
MIN_MATCHES_BAT = 6
MIN_MATCHES_BOWL = 6
MIN_BALLS_FACED = 50
MIN_BALLS_BOWLED = 120
PRIOR_BALLS_BATTING = 120.0
PRIOR_BALLS_BOWLING = 72.0


def qualifies_bat(bat):
    return (bat['mat'] >= MIN_MATCHES_BAT and bat['bf'] >= MIN_BALLS_FACED
            and bat['sr'] is not None and bat['inns'] > 0)


def qualifies_bowl(bowl):
    return (bowl['mat'] >= MIN_MATCHES_BOWL and bowl['overs_balls'] >= MIN_BALLS_BOWLED
            and bowl['runsconceded'] is not None)


class Percentiles:
    """Precomputes a sorted pool once, then does O(log n) average-rank lookups."""

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


def classify_role(role_text):
    r = (role_text or '').lower()
    if 'keeper' in r or re.search(r'\bwk\b', r):
        return 'Wicketkeeper Batter'
    if 'opener' in r:
        return 'Opener'
    if 'finisher' in r:
        return 'Finisher'
    if 'batting all-rounder' in r or 'batting all rounder' in r:
        return 'Batting All-rounder'
    if 'all-rounder' in r or 'all rounder' in r:
        return 'Bowling All-rounder'
    if 'top order' in r or 'top-order' in r or 'no. 3' in r or 'top/middle' in r:
        return 'Top-order Batter'
    if 'middle order' in r or 'middle-order' in r:
        return 'Middle-order Batter'
    if 'spin' in r:
        return 'Spinner'
    if 'pace' in r or 'pacer' in r or 'seam' in r or 'new-ball' in r or 'medium' in r:
        return 'Pacer'
    if any(k in r for k in ('bowl', 'wicket-taking')):
        return 'Specialist Bowler'
    return 'Middle-order Batter'


def build_player_metrics(rec):
    """Convert raw string fields into numeric derived batting/bowling inputs."""
    inns = to_int(rec.get('bat_inns'))
    runs = to_int(rec.get('bat_runs'))
    bf = to_int(rec.get('bat_bf'))
    sr = to_float(rec.get('bat_sr'))
    no = to_int(rec.get('bat_no'))
    fifties = to_int(rec.get('bat_fifties')) or 0
    hundreds = to_int(rec.get('bat_hundreds')) or 0
    sixes = to_int(rec.get('bat_sixes')) or 0
    fours = to_int(rec.get('bat_fours')) or 0
    mat = to_int(rec.get('bat_mat')) or 0

    m = {
        'inns': inns or 0, 'runs': runs or 0, 'bf': bf or 0, 'sr': sr,
        'no': no or 0, 'fifties': fifties, 'hundreds': hundreds, 'sixes': sixes,
        'fours': fours, 'mat': mat,
    }

    bowl_inns = to_int(rec.get('bowl_inns'))
    overs_balls = overs_to_balls(rec.get('bowl_overs'))
    wickets = to_int(rec.get('bowl_wickets'))
    runsconceded = to_int(rec.get('bowl_runsconceded'))
    econ = to_float(rec.get('bowl_econ'))
    bowlavg = to_float(rec.get('bowl_avg'))
    bowlsr = to_float(rec.get('bowl_sr'))
    fourw = to_int(rec.get('bowl_fourw')) or 0
    bowl_mat = to_int(rec.get('bowl_mat')) or 0

    bm = {
        'bowl_inns': bowl_inns or 0,
        'overs_balls': overs_balls or 0,
        'wickets': wickets or 0,
        'runsconceded': runsconceded,
        'econ': econ,
        'bowlavg': bowlavg,
        'bowlsr': bowlsr,
        'fourw': fourw,
        'mat': bowl_mat,
    }
    return m, bm


def compute_all_players():
    all_players = []
    for season, fname in FILES.items():
        text = (REPO / fname).read_text()
        players = extract_players(text, season)
        all_players.extend(players)

    for rec in all_players:
        m, bm = build_player_metrics(rec)
        rec['_bat'] = m
        rec['_bowl'] = bm
        rec['role_category'] = classify_role(rec['role'])
        rec['_is_spin'] = 'spin' in (rec.get('role') or '').lower()
        rec['isOverseas'] = OVERSEAS_LOOKUP.get(f"{rec['name']}|{rec['team']}|{rec['season']}", False)
        # Some season files carry Econ but not a raw runs-conceded column at
        # all (2018 and 2026 are 100% missing it). Reconstruct it exactly
        # (Econ is defined as runs/(balls/6)) rather than let it silently
        # zero out a bowler's contribution to the league average.
        if bm['runsconceded'] is None and bm['econ'] is not None and bm['overs_balls'] > 0:
            bm['runsconceded'] = round(bm['econ'] * bm['overs_balls'] / 6)

    # ---- league averages per season, among QUALIFYING players only ----
    by_season_bat = defaultdict(list)
    by_season_bowl_pace = defaultdict(list)
    by_season_bowl_spin = defaultdict(list)
    for r in all_players:
        bat = r['_bat']
        if qualifies_bat(bat):
            rpm = bat['runs'] / bat['mat']
            bnd = (bat['fours'] + bat['sixes']) / bat['bf'] * 100
            by_season_bat[r['season']].append((rpm, bat['sr'], bnd))
        bowl = r['_bowl']
        if qualifies_bowl(bowl):
            wpm = bowl['wickets'] / bowl['mat']
            econ = bowl['runsconceded'] / (bowl['overs_balls'] / 6)
            bucket = by_season_bowl_spin if r['_is_spin'] else by_season_bowl_pace
            bucket[r['season']].append((wpm, econ))

    avg_bat = {s: dict(rpm=statistics.mean(x[0] for x in v), sr=statistics.mean(x[1] for x in v),
                        bnd=statistics.mean(x[2] for x in v)) for s, v in by_season_bat.items()}
    avg_pace = {s: dict(wpm=statistics.mean(x[0] for x in v), econ=statistics.mean(x[1] for x in v))
                for s, v in by_season_bowl_pace.items()}
    avg_spin = {s: dict(wpm=statistics.mean(x[0] for x in v), econ=statistics.mean(x[1] for x in v))
                for s, v in by_season_bowl_spin.items()}

    ref_bat = avg_bat[REFERENCE_SEASON]
    ref_pace = avg_pace[REFERENCE_SEASON]
    ref_spin = avg_spin[REFERENCE_SEASON]

    # ---- era-normalize each player's rate; sub-threshold samples get a ----
    # ---- confidence-shrunk fallback instead of being dropped ----
    for r in all_players:
        bat, bowl = r['_bat'], r['_bowl']
        r['_adj_rpm'] = r['_adj_sr'] = r['_adj_bnd'] = None
        r['_adj_wpm'] = r['_adj_econ'] = None
        r['_qual_bat'] = qualifies_bat(bat)
        r['_qual_bowl'] = qualifies_bowl(bowl)

        if bat['bf'] > 0 and bat['sr'] is not None and bat['inns'] > 0 and bat['mat'] > 0 and r['season'] in avg_bat:
            s_avg = avg_bat[r['season']]
            rpm = bat['runs'] / bat['mat']
            bnd = (bat['fours'] + bat['sixes']) / bat['bf'] * 100
            adj_rpm = rpm * (ref_bat['rpm'] / s_avg['rpm'])
            adj_sr = bat['sr'] * (ref_bat['sr'] / s_avg['sr'])
            adj_bnd = bnd * (ref_bat['bnd'] / s_avg['bnd'])
            if r['_qual_bat']:
                r['_adj_rpm'], r['_adj_sr'], r['_adj_bnd'] = adj_rpm, adj_sr, adj_bnd
            else:
                conf = bat['bf'] / (bat['bf'] + PRIOR_BALLS_BATTING)
                r['_adj_rpm'] = conf * adj_rpm + (1 - conf) * ref_bat['rpm']
                r['_adj_sr'] = conf * adj_sr + (1 - conf) * ref_bat['sr']
                r['_adj_bnd'] = conf * adj_bnd + (1 - conf) * ref_bat['bnd']

        avg_pool = avg_spin if r['_is_spin'] else avg_pace
        ref_pool = ref_spin if r['_is_spin'] else ref_pace
        if bowl['overs_balls'] > 0 and bowl['runsconceded'] is not None and bowl['mat'] > 0 and r['season'] in avg_pool:
            s_avg = avg_pool[r['season']]
            wpm = bowl['wickets'] / bowl['mat']
            econ = bowl['runsconceded'] / (bowl['overs_balls'] / 6)
            adj_wpm = wpm * (ref_pool['wpm'] / s_avg['wpm'])
            adj_econ = econ * (ref_pool['econ'] / s_avg['econ'])
            if r['_qual_bowl']:
                r['_adj_wpm'], r['_adj_econ'] = adj_wpm, adj_econ
            else:
                conf = bowl['overs_balls'] / (bowl['overs_balls'] + PRIOR_BALLS_BOWLING)
                r['_adj_wpm'] = conf * adj_wpm + (1 - conf) * ref_pool['wpm']
                r['_adj_econ'] = conf * adj_econ + (1 - conf) * ref_pool['econ']

    # ---- global percentile pools across all seasons (qualifying players only) ----
    rpm_pool = Percentiles([r['_adj_rpm'] for r in all_players if r['_adj_rpm'] is not None and r['_qual_bat']])
    sr_pool = Percentiles([r['_adj_sr'] for r in all_players if r['_adj_sr'] is not None and r['_qual_bat']])
    bnd_pool = Percentiles([r['_adj_bnd'] for r in all_players if r['_adj_bnd'] is not None and r['_qual_bat']])
    pace_wpm_pool = Percentiles(
        [r['_adj_wpm'] for r in all_players if r['_adj_wpm'] is not None and r['_qual_bowl'] and not r['_is_spin']])
    pace_econ_pool = Percentiles(
        [r['_adj_econ'] for r in all_players if r['_adj_econ'] is not None and r['_qual_bowl'] and not r['_is_spin']])
    spin_wpm_pool = Percentiles(
        [r['_adj_wpm'] for r in all_players if r['_adj_wpm'] is not None and r['_qual_bowl'] and r['_is_spin']])
    spin_econ_pool = Percentiles(
        [r['_adj_econ'] for r in all_players if r['_adj_econ'] is not None and r['_qual_bowl'] and r['_is_spin']])

    for r in all_players:
        rpm_pct = rpm_pool.of(r['_adj_rpm'])
        sr_pct = sr_pool.of(r['_adj_sr'])
        bnd_pct = bnd_pool.of(r['_adj_bnd'])
        r['BattingPower'] = round(0.6 * rpm_pct + 0.4 * sr_pct, 1) if None not in (rpm_pct, sr_pct) else None
        r['FinishingPower'] = (
            round(0.2 * rpm_pct + 0.4 * sr_pct + 0.4 * bnd_pct, 1)
            if None not in (rpm_pct, sr_pct, bnd_pct) else None
        )

        if r['_is_spin']:
            wpm_pct = spin_wpm_pool.of(r['_adj_wpm'])
            econ_pct = spin_econ_pool.of(r['_adj_econ'], higher_is_better=False)
        else:
            wpm_pct = pace_wpm_pool.of(r['_adj_wpm'])
            econ_pct = pace_econ_pool.of(r['_adj_econ'], higher_is_better=False)
        r['BowlingScore'] = round(0.6 * wpm_pct + 0.4 * econ_pct, 1) if None not in (wpm_pct, econ_pct) else None

    return all_players


def main():
    all_players = compute_all_players()
    seasons = sorted(set(r['season'] for r in all_players))

    # ---- write full audit CSV ----
    out_path = "/tmp/claude-0/-home-user-ipl-300/f3ec677b-388b-598c-a8d1-2914b979aaca/scratchpad/ipl_player_power_scores_full.csv"
    fields = ['Season', 'Team', 'POS', 'Name', 'Role', 'BattingPower', 'FinishingPower', 'BowlingScore']
    ordered = sorted(all_players, key=lambda r: (r['season'], TEAMS.index(r['team']) if r['team'] in TEAMS else 99, r['pos']))
    with open(out_path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(fields)
        for r in ordered:
            w.writerow([
                r['season'], r['team'], r['pos'], r['name'], r['role'],
                r.get('BattingPower', ''), r.get('FinishingPower', ''), r.get('BowlingScore', ''),
            ])
    print('wrote', out_path, 'rows:', len(all_players))

    # ---- write clean display CSV: exactly the in-game XI table shape ----
    display_path = "/tmp/claude-0/-home-user-ipl-300/f3ec677b-388b-598c-a8d1-2914b979aaca/scratchpad/ipl_xi_display.csv"
    with open(display_path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['SEASON', 'TEAM', 'POS', 'PLAYER', 'BATTING_SCORE', 'FINISHING_SCORE', 'BOWLING_SCORE'])
        for r in ordered:
            w.writerow([
                r['season'], r['team'], r['pos'], r['name'],
                r.get('BattingPower', ''), r.get('FinishingPower', ''),
                r.get('BowlingScore', '') if r.get('BowlingScore') is not None else '-',
            ])
    print('wrote', display_path)

    # sanity prints
    for season in seasons:
        n = sum(1 for r in all_players if r['season'] == season)
        print(season, 'players:', n)


if __name__ == '__main__':
    main()
