"""Use the pinned fas package for scoring and event analysis.

h/a: home/away ratings; c: configuration; uid: stable entity identifier.
Ratings remain attributed game inputs. They are never counted as observed
events or per-90 measurements. Match predictions use fixed game assumptions.
"""
from __future__ import annotations

from dataclasses import asdict, is_dataclass
from functools import lru_cache
from hashlib import sha256
from importlib import import_module, metadata
import inspect
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.special import gammaln
from scipy.stats import poisson

FAS_COMMIT = 'a83c577a1d6b81da3a25a41f03c8e4096ecc4764'
FAS_PIN = f'fas @ git+https://github.com/symonyeal/football_analytics_system.git@{FAS_COMMIT}'
MODEL_VERSION = 'era-attributes-v1'
SCORING_SHA256 = 'c8cadc7fb108e185ab55252a47fbe0dd3d460de04c675549fbd582de80198ad1'
MODEL_LABEL = 'Fixed attribute, role, tactical and chemistry assumptions; not fitted to match results.'


@lru_cache(maxsize=1)
def _scoring_class():
    try:
        return import_module('fas.performance.team_scoring').TeamScoringModel
    except ImportError:
        return None


def backend_status():
    """Describe the installed dependency and the assumptions used in gameplay."""
    cls = _scoring_class()
    version = None
    checked = False
    if cls is not None:
        try:
            version = metadata.version('fas')
        except metadata.PackageNotFoundError:
            version = 'source import'
        path = inspect.getsourcefile(cls)
        if path:
            checked = sha256(Path(path).read_bytes()).hexdigest() == SCORING_SHA256
    return dict(available=cls is not None, backend='fas' if cls else 'offline fallback',
                version=version, dependency_pin=FAS_PIN, audited_commit=FAS_COMMIT,
                scoring_module_matches_audit=checked, model_version=MODEL_VERSION,
                trained=False, label=MODEL_LABEL,
                limitation='Event models require separately supplied, attributed event data.')


def _config(config):
    return asdict(config) if is_dataclass(config) else dict(config)


def _finite(value, name):
    if isinstance(value, (bool, np.bool_)):
        raise ValueError(f'{name} must be a finite number.')
    try:
        value = float(value)
    except (ValueError, TypeError) as exc:
        raise ValueError(f'{name} must be a finite number.') from exc
    if not math.isfinite(value):
        raise ValueError(f'{name} must be a finite number.')
    return value


def expected_rates(home_rating, away_rating, config, *, advantage=None, duration=90):
    """Return expected goals with the original formula and operation order."""
    c = _config(config)
    scale = _finite(c['role_scale'], 'role_scale')
    base = _finite(c['base_goals'], 'base_goals')
    duration = _finite(duration, 'duration')
    advantage = _finite(c.get('home_advantage', .12) if advantage is None else advantage, 'advantage')
    if scale <= 0 or base <= 0 or not 0 <= duration <= 90 or not -.5 <= advantage <= .5:
        raise ValueError('Positive goal base/role scale, duration 0..90 and advantage -0.5..0.5 are required.')
    h = {k: _finite(home_rating[k], 'home '+k) for k in ('attack', 'control', 'defence')}
    a = {k: _finite(away_rating[k], 'away '+k) for k in ('attack', 'control', 'defence')}
    log_h = (h['attack']-a['defence'])/scale+.25*(h['control']-a['control'])/scale+advantage
    log_a = (a['attack']-h['defence'])/scale+.25*(a['control']-h['control'])/scale
    strengths = np.clip([log_h, log_a], -1.5, 1.5)
    cls = _scoring_class()
    if cls is None:
        rates = tuple(float(np.exp(x)) for x in strengths)
    else:
        # The pair's role/control contrasts already include home advantage.
        # This is a fixed-parameter mapping, with no training step or DC fit.
        model = cls(teams=[0, 1], attack=pd.Series(strengths, index=[0, 1]),
                    defense=pd.Series([0., 0.], index=[0, 1]),
                    home_advantage=0., rho=0., log_likelihood=float('nan'),
                    method='Fixed game attribute contrasts', math='Poisson rate mapping')
        rates = model.expected_goals(0, 1)
    return tuple(float(base*r*duration/90) for r in rates)


def entity_uid(identity):
    """Map an explicit source identity to a deterministic positive integer."""
    if not isinstance(identity, str) or not identity:
        raise ValueError('An explicit source identity is required; names do not identify a person.')
    return int.from_bytes(sha256(identity.encode('utf-8')).digest()[:8], 'big') & ((1 << 63)-1)


def player_record(card):
    """Map a card to PlayerSeason without inventing event measurements."""
    from fas.entities import PlayerSeason
    from .data import OUTFIELD, KEEPER, validate_players
    validate_players([card])
    evidence = ('historical reconstruction' if 'reconstruction' in card['lineage']
                else 'PES group mapping proxy' if 'proxy' in card['lineage']
                else 'published or user-supplied game attributes')
    attributes = {k: card.get(k) for k in OUTFIELD+KEEPER+('overall', 'stamina', 'vision', 'finishing')}
    provenance = {k: card.get(k) for k in ('id', 'identity', 'source', 'source_date', 'lineage',
                                         'era', 'era_basis', 'season', 'license', 'attribute_mapping')}
    return PlayerSeason(player_uid=entity_uid(card['identity']), league=card.get('league', ''),
                        season=card.get('season', ''), position=card['positions'][0],
                        performance={'card': provenance, 'attributes': attributes,
                                     'attribute_evidence': evidence,
                                     'positions': list(card['positions']),
                                     'missing_attributes': [k for k, v in attributes.items() if v is None],
                                     'event_measurements_available': False})


def team_record(team, ratings=None):
    """Map the squad, formation and manager to TeamSeason context."""
    from fas.entities import TeamSeason
    from .engine import rate_team
    cards = [s['player'] for s in team['starters']]+list(team['bench'])
    people = [p['identity'] for p in cards]
    if len(people) != 15 or len(set(people)) != 15:
        raise ValueError('The squad must contain fifteen distinct source identities.')
    uids = [entity_uid(p) for p in people]
    if len(set(uids)) != len(uids):
        raise ValueError('Entity ID collision; supply a different explicit identity mapping.')
    context = {'formation': team['formation'], 'manager': team['manager'],
               'starters': [{'card_id': s['player']['id'], 'player_uid': entity_uid(s['player']['identity']),
                             'slot': s['slot'], 'fit': s['fit'], 'role_score': s['role_score']}
                            for s in team['starters']],
               'bench_card_ids': [p['id'] for p in team['bench']]}
    key = json.dumps(context, sort_keys=True, ensure_ascii=True)
    return TeamSeason(team_id=entity_uid(key), squad=uids,
                      performance={'game_context': context, 'ratings': ratings or rate_team(team),
                                   'model_version': MODEL_VERSION, 'label': MODEL_LABEL,
                                   'event_measurements_available': False})


def _distribution(home_rate, away_rate, max_goals=16):
    cls = _scoring_class()
    if cls:
        model = cls(teams=[0, 1], attack=pd.Series(np.log([home_rate, away_rate]), index=[0, 1]),
                    defense=pd.Series([0., 0.], index=[0, 1]), home_advantage=0., rho=0.,
                    log_likelihood=float('nan'), method='Fixed game rates', math='Independent Poisson')
        return model.score_distribution(0, 1, max_goals=max_goals)
    g = np.arange(max_goals+1)
    ph = np.exp(g*np.log(home_rate+1e-12)-home_rate-gammaln(g+1))
    pa = np.exp(g*np.log(away_rate+1e-12)-away_rate-gammaln(g+1))
    p = np.outer(ph, pa)
    p /= p.sum()
    return pd.DataFrame({'home_goals': np.repeat(g, len(g)), 'away_goals': np.tile(g, len(g)),
                         'prob': p.ravel()})


def matchup_analysis(home, away, config=None, *, advantage=None):
    """Explain the same rates used by match simulation and their uncertainty."""
    from .engine import match_rates
    rates = match_rates(home, away, config, advantage)
    dist = _distribution(rates['home_xg'], rates['away_xg'])
    p = dist['prob']; h = dist['home_goals']; a = dist['away_goals']
    probs = {'home': float(p[h > a].sum()), 'draw': float(p[h == a].sum()), 'away': float(p[h < a].sum())}
    contrasts = {k: float(rates['home_rating'][k]-rates['away_rating'][k]) for k in ('attack', 'control', 'defence')}
    return dict(backend=backend_status(), model_version=MODEL_VERSION, trained=False,
                expected_home_goals=rates['home_xg'], expected_away_goals=rates['away_xg'],
                probabilities=probs, likely_scorelines=dist.nlargest(5, 'prob').to_dict('records'),
                tail_probability=1-float(poisson.cdf(16, rates['home_xg'])*poisson.cdf(16, rates['away_xg'])),
                home_rating=rates['home_rating'], away_rating=rates['away_rating'], contrasts=contrasts,
                label=MODEL_LABEL,
                uncertainty='Score probabilities include simulation randomness. They exclude uncertainty in ratings, era mappings and fixed model assumptions.',
                scoreline_note='Scores from 0 to 16 are renormalized; tail_probability reports omitted mass.')


def attribute_compatibility(team):
    """Describe attribute similarity; this diagnostic does not alter chemistry."""
    from fas.milp.squad_selection import cosine_compat
    from .data import OUTFIELD
    players = [s['player'] for s in team['starters'] if s['slot'] != 'GK']
    frame = pd.DataFrame([{k: p[k] for k in OUTFIELD} for p in players], index=[p['id'] for p in players])
    matrix = cosine_compat(frame)
    values = matrix.to_numpy()[np.triu_indices(len(matrix), 1)]
    return dict(matrix=matrix, mean=float(values.mean()),
                label='Cosine similarity of game attributes; descriptive only, not measured team chemistry.',
                affects_gameplay=False)


def matchup_record(home, away, config=None, *, advantage=None):
    """Map a game prediction to Matchup with its fixed assumptions attached."""
    from fas.entities import Matchup
    prediction = matchup_analysis(home, away, config, advantage=advantage)
    h = team_record(home); a = team_record(away)
    return Matchup(entity_i=h.team_id, entity_j=a.team_id,
                   context='Drafted squads; fixed game attributes',
                   predicted_distribution=_distribution(prediction['expected_home_goals'],
                                                        prediction['expected_away_goals']),
                   explanations=[{'model_version': MODEL_VERSION, 'label': MODEL_LABEL,
                                  'probabilities': prediction['probabilities'],
                                  'uncertainty': prediction['uncertainty']}])


def simulated_match_record(result, home, away):
    """Store a simulated result in MatchObject without fabricated spatial actions."""
    from fas.entities import MatchObject, MatchMeta
    h = team_record(home); a = team_record(away)
    match_id = entity_uid(json.dumps({'home': h.team_id, 'away': a.team_id,
                                     'seed': result['seed']}, sort_keys=True))
    meta = MatchMeta(competition='Era Eleven simulation', home_team_id=h.team_id,
                     away_team_id=a.team_id, home_goals=int(result['home_goals']),
                     away_goals=int(result['away_goals']),
                     extra={'evidence': 'simulated statistics', 'model_version': MODEL_VERSION,
                            'result': result, 'spatial_actions_available': False})
    return MatchObject(match_id=match_id, meta=meta)


def canonical_actions(events, *, match_id=None):
    """Convert canonical or StatsBomb events with strict input validation."""
    from fas.data.schema import COLUMNS, validate_actions
    from fas.data.statsbomb import events_to_actions, _TYPE_MAP
    frame = pd.DataFrame(events).copy()
    if not set(COLUMNS) <= set(frame):
        if match_id is None:
            raise ValueError('StatsBomb conversion requires an explicit match_id.')
        for entity in ('player', 'team'):
            if entity+'_id' not in frame and entity in frame:
                frame[entity+'_id'] = frame[entity].map(lambda value: value.get('id') if isinstance(value, dict) else None)
        if 'type' in frame:
            frame['type'] = frame['type'].map(lambda value: value.get('name') if isinstance(value, dict) else value)
        if not {'player_id', 'team_id', 'type', 'location'} <= set(frame):
            raise ValueError('StatsBomb events need numeric player_id/team_id, type and location.')
        # Upstream reads flattened outcomes first. Preserve raw JSON outcomes
        # explicitly rather than accepting every nested shot as a missed shot.
        for action in ('shot', 'pass'):
            column = action+'_outcome'
            if column not in frame:
                def outcome(value):
                    value = value.get('outcome') if isinstance(value, dict) else None
                    return value.get('name') if isinstance(value, dict) else value
                frame[column] = frame[action].map(outcome) if action in frame else None
        for column in ('minute', 'second'):
            if column not in frame:
                frame[column] = 0
        raw = frame.copy()
        raw['provider_row']=np.arange(len(raw))
        if 'id' in raw and raw['id'].dropna().astype(str).duplicated().any():
            raise ValueError('Repeated provider event IDs cannot be counted twice.')
        retained=raw[raw['type'].isin(_TYPE_MAP)].reset_index(drop=True)
        frame = events_to_actions(raw, match_id=int(match_id))
        # The audited converter retains filtered row indices when dropping
        # missing actors/locations. Clock and actor are not event identities:
        # a pass and carry can legitimately occur in the same recorded second.
        if not frame.index.is_unique or not frame.index.isin(retained.index).all():
            raise ValueError('Installed converter row alignment differs from the audited dependency.')
        for source,target in [('provider_row','provider_row'),('id','provider_event_id'),('index','provider_index'),('possession','possession')]:
            if source in retained:frame[target]=retained.loc[frame.index,source]
    if frame.empty:
        raise ValueError('No supported on-ball events remain after conversion.')
    if frame[list(COLUMNS)].isna().any()[['match_id', 'period', 'timestamp_ms', 'player_id', 'team_id',
                                         'action_type', 'x_start', 'y_start', 'outcome']].any():
        raise ValueError('Required canonical event fields cannot be missing.')
    for column in ('match_id', 'period', 'timestamp_ms', 'player_id', 'team_id'):
        numeric = pd.to_numeric(frame[column], errors='raise')
        if not np.isfinite(numeric).all() or (numeric < 0).any() or (numeric % 1 != 0).any():
            raise ValueError(f'{column} must contain nonnegative integer identifiers or times.')
        frame[column] = numeric.astype('int64')
    if not frame['period'].between(1, 5).all():
        raise ValueError('Football periods must be 1..5 (including extra time and shootouts).')
    if not frame['outcome'].map(lambda v: isinstance(v, (bool, np.bool_, int, np.integer)) and v in (0, 1)).all():
        raise ValueError('Outcome must contain booleans or the integer values 0/1.')
    for column, maximum in (('x_start', 120), ('x_end', 120), ('y_start', 80), ('y_end', 80)):
        frame[column] = pd.to_numeric(frame[column], errors='raise')
        value = frame[column].dropna()
        if not np.isfinite(value).all() or not value.between(0, maximum).all():
            raise ValueError(f'{column} must be finite and within 0..{maximum}.')
    if (frame['x_end'].isna() != frame['y_end'].isna()).any():
        raise ValueError('End coordinates must be present or absent together.')
    return validate_actions(frame).sort_values(['match_id', 'period', 'timestamp_ms'], kind='stable').reset_index(drop=True)


def analyse_events(events, *, training_events=None, match_id=None, evidence='user-provided events', grid=(8, 6)):
    """Measure xT, progression and pass networks on supplied event data."""
    from fas.entities import MatchObject
    from fas.graph.pass_network import build_pass_network, network_entropy
    from fas.graph.centrality import centrality_table
    from fas.network_flow.xt_surface import fit_xt, xt_added
    from fas.network_flow.max_flow_buildup import build_zone_graph
    from fas.performance.roles_nmf import fit_roles_nmf
    actions = canonical_actions(events, match_id=match_id)
    shootout_rows = int((actions['period'] == 5).sum())
    actions = actions[actions['period'] <= 4].reset_index(drop=True)
    if actions.empty:
        raise ValueError('Shootout events are excluded; provide events from match play.')
    if actions['match_id'].nunique() != 1:
        raise ValueError('Analyse one match at a time; fit training_events across other matches.')
    training = canonical_actions(training_events) if training_events is not None else actions
    training = training[training['period'] <= 4].reset_index(drop=True)
    if training.empty:
        raise ValueError('xT training requires match-play events, excluding shootouts.')
    if len(grid) != 2 or any(isinstance(n, bool) or not isinstance(n, int) or not 1 <= n <= 32 for n in grid):
        raise ValueError('xT grid requires two integers from 1 to 32.')
    xt = fit_xt(training, n_x=grid[0], n_y=grid[1])
    moves = actions[actions['action_type'].isin(['pass', 'carry']) & actions['outcome']].dropna(subset=['x_end', 'y_end'])
    added = xt_added(xt, actions) if not moves.empty else pd.Series(dtype=float, name='xt_added')
    networks = {}; centrality = {}; flows = {}; summaries = []
    # Run the upstream receiver heuristic inside individual possessions only.
    # Without possession IDs, avoid cross-period links and state the limitation.
    group_keys = ['period']+(['possession'] if 'possession' in actions else [])
    from fas.graph.pass_network import PassNetwork
    import networkx as nx
    for team_id in sorted(actions['team_id'].unique()):
        graph = nx.DiGraph()
        for _, chunk in actions.groupby(group_keys, sort=True):
            net = build_pass_network(chunk, int(team_id))
            graph.add_nodes_from(net.players)
            for u, v, data in net.graph.edges(data=True):
                old = graph.get_edge_data(u, v, {}).get('weight', 0.)
                graph.add_edge(u, v, weight=old+data['weight'])
        ids = sorted(graph.nodes)
        matrix = nx.to_numpy_array(graph, nodelist=ids, weight='weight')
        net = PassNetwork(ids, matrix, graph)
        networks[int(team_id)] = net
        centrality[int(team_id)] = centrality_table(net) if ids else pd.DataFrame()
        flows[int(team_id)] = build_zone_graph(actions, int(team_id), xt_model=xt, min_count=1)
        tm = moves[moves['team_id'] == team_id]
        summaries.append(dict(team_id=int(team_id), completed_passes=int(((actions['team_id'] == team_id) &
                                  (actions['action_type'] == 'pass') & actions['outcome']).sum()),
                              inferred_pass_links=int(matrix.sum()), passing_entropy=network_entropy(net),
                              progressive_moves=int((tm['x_end'] > tm['x_start']).sum()),
                              xt_added=float(added.reindex(tm.index, fill_value=0.).sum())))
    roles = fit_roles_nmf(actions, n_roles=min(4, actions['player_id'].nunique()))
    obj = MatchObject(match_id=int(actions['match_id'].iloc[0]), actions=actions,
                      pass_networks=networks, centrality=centrality, xt_added=added, zone_flow=flows)
    return dict(match=obj, xt_model=xt, role_model=roles, summary=pd.DataFrame(summaries), evidence=evidence,
                shootout_rows_excluded=shootout_rows,
                fit_scope='Separate training events' if training_events is not None else 'Descriptive fit on this same match',
                affects_gameplay=False,
                limitation='xT and latent roles describe supplied events. Receiver identities use the next same-team actor heuristic'+
                           (' within possession and period.' if 'possession' in actions else ' within period; possession IDs were not supplied.')+
                           ' These outputs do not calibrate cross-era card ratings or game predictions.')


def evaluate_results(matches, *, split_date):
    """Fit fas scoring on earlier matches and compare on strictly later matches."""
    from fas.performance.team_scoring import fit_dixon_coles
    from fas.evaluation.metrics import expected_calibration_error
    frame = pd.DataFrame(matches).copy()
    required = {'date', 'home_team', 'away_team', 'home_goals', 'away_goals'}
    if not required <= set(frame):
        raise ValueError('Match evaluation requires dates, team IDs and actual home/away goals.')
    if len(frame) < 4:
        raise ValueError('Supply at least four dated matches; a tiny fixture is not model validation.')
    frame['date'] = pd.to_datetime(frame['date'], errors='raise', utc=True)
    if frame['date'].isna().any():
        raise ValueError('Match dates cannot be missing.')
    for key in ('home_team', 'away_team', 'home_goals', 'away_goals'):
        v = pd.to_numeric(frame[key], errors='raise')
        if not np.isfinite(v).all() or (v < 0).any() or (v % 1 != 0).any():
            raise ValueError(f'{key} must contain nonnegative integers.')
        frame[key] = v.astype(int)
    cut = pd.to_datetime(split_date, utc=True)
    train = frame[frame['date'] < cut].sort_values('date')
    test = frame[frame['date'] >= cut].sort_values('date')
    if len(train) < 2 or len(test) < 2:
        raise ValueError('Both time periods require at least two matches.')
    known = set(train['home_team']) | set(train['away_team'])
    if not (set(test['home_team']) | set(test['away_team'])) <= known:
        raise ValueError('Evaluation has unseen teams; supply training history or a separate explicit cold-start model.')
    # rho=0: upstream fits independent Poisson likelihood; rho is supplied,
    # rather than estimated in that likelihood. Do not claim a learned DC rho.
    model = fit_dixon_coles(train, rho=0.)
    baseline = (max(.01, float(train['home_goals'].mean())), max(.01, float(train['away_goals'].mean())))
    rows = []
    for row in test.itertuples():
        rates = model.expected_goals(row.home_team, row.away_team)
        actual = (row.home_goals, row.away_goals)
        outcome = 0 if actual[0] > actual[1] else 1 if actual[0] == actual[1] else 2
        for name, pair in (('fas time-split Poisson', rates), ('training mean baseline', baseline)):
            distribution = _distribution(*pair)
            hg = distribution['home_goals']; ag = distribution['away_goals']; p = distribution['prob']
            probs = np.array([p[hg > ag].sum(), p[hg == ag].sum(), p[hg < ag].sum()])
            label = np.eye(3)[outcome]
            rows.append(dict(date=row.date.isoformat(), model=name,
                             poisson_nll=float(-sum(poisson.logpmf(k, mu) for k, mu in zip(actual, pair))),
                             brier=float(np.square(probs-label).sum()), home_probability=float(probs[0]),
                             home_won=int(outcome == 0)))
    detail = pd.DataFrame(rows)
    metrics = detail.groupby('model')[['poisson_nll', 'brier']].mean().reset_index()
    metrics['home_ece'] = [expected_calibration_error(detail[detail.model == name].home_probability.to_numpy(),
                             detail[detail.model == name].home_won.to_numpy()) for name in metrics.model]
    return dict(model=model, metrics=metrics, predictions=detail, training_matches=len(train),
                evaluation_matches=len(test), split_date=cut.isoformat(),
                training_end=train.date.max().isoformat(), evaluation_start=test.date.min().isoformat(),
                affects_gameplay=False,
                limitation='Historical team evaluation applies to supplied competition/team IDs. It does not validate drafted cross-era squads. Upstream does not expose optimizer convergence in the returned model.')
