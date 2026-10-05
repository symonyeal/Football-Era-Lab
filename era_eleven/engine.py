"""Assign roles, rate units, and simulate goals with explicit demo coefficients."""
from dataclasses import dataclass, asdict
from copy import deepcopy
import math
import numpy as np
from scipy.optimize import linear_sum_assignment, milp, Bounds, LinearConstraint
from scipy.sparse import coo_matrix, vstack
from .data import validate_players, OUTFIELD

ERAS=('All eras','Legends','1990s','2000s','2010s','2020s')
FORMATIONS={
 '4-3-3': [('GK',50,91),('LB',16,72),('CB',38,76),('CB',62,76),('RB',84,72),('CDM',50,57),('CM',31,43),('CM',69,43),('LW',18,23),('ST',50,18),('RW',82,23)],
 '4-2-3-1': [('GK',50,91),('LB',16,72),('CB',38,76),('CB',62,76),('RB',84,72),('CDM',35,57),('CDM',65,57),('LM',18,35),('CAM',50,35),('RM',82,35),('ST',50,17)],
 '4-4-2': [('GK',50,91),('LB',16,72),('CB',38,76),('CB',62,76),('RB',84,72),('LM',18,45),('CM',39,49),('CM',61,49),('RM',82,45),('ST',35,20),('ST',65,20)],
 '3-5-2': [('GK',50,91),('CB',24,75),('CB',50,78),('CB',76,75),('LWB',12,48),('CDM',50,58),('CM',32,41),('CAM',63,38),('RWB',88,48),('ST',35,20),('ST',65,20)],
 '3-4-3': [('GK',50,91),('CB',24,75),('CB',50,78),('CB',76,75),('LM',15,47),('CM',38,50),('CM',62,50),('RM',85,47),('LW',20,23),('ST',50,17),('RW',80,23)],
 '4-3-1-2': [('GK',50,91),('LB',16,72),('CB',38,76),('CB',62,76),('RB',84,72),('CM',29,48),('CDM',50,57),('CM',71,48),('CAM',50,33),('ST',35,18),('ST',65,18)],
}
MANAGERS=[
 dict(name='Pep Guardiola',era='2020s',formations=['4-3-3','3-4-3'],style='Positional play',possession=.95,press=.85,attack=.75),
 dict(name='Jürgen Klopp',era='2010s',formations=['4-3-3','4-2-3-1'],style='Gegenpress',possession=.65,press=.98,attack=.90),
 dict(name='Carlo Ancelotti',era='2020s',formations=['4-3-1-2','4-3-3'],style='Adaptable control',possession=.75,press=.55,attack=.70),
 dict(name='Sir Alex Ferguson',era='2000s',formations=['4-4-2','4-2-3-1'],style='Fast wide attacks',possession=.65,press=.70,attack=.90),
 dict(name='Arsène Wenger',era='2000s',formations=['4-4-2','4-2-3-1'],style='Fluid combinations',possession=.88,press=.60,attack=.85),
 dict(name='José Mourinho',era='2000s',formations=['4-2-3-1','4-3-3'],style='Compact transitions',possession=.45,press=.50,attack=.55),
 dict(name='Johan Cruyff',era='1990s',formations=['3-4-3','4-3-3'],style='Total football',possession=.98,press=.80,attack=.95),
 dict(name='Arrigo Sacchi',era='1990s',formations=['4-4-2'],style='Coordinated pressure',possession=.70,press=.95,attack=.70),
 dict(name='Rinus Michels',era='Classics',formations=['4-3-3'],style='Total football',possession=.90,press=.85,attack=.90),
 dict(name='Helenio Herrera',era='Classics',formations=['3-5-2'],style='Deep block',possession=.35,press=.35,attack=.40),
 dict(name='Vicente del Bosque',era='2010s',formations=['4-2-3-1','4-3-3'],style='Patient possession',possession=.95,press=.55,attack=.65),
 dict(name='Zinedine Zidane',era='2010s',formations=['4-3-3','4-3-1-2'],style='Balanced freedom',possession=.75,press=.65,attack=.80),
 dict(name='Lionel Scaloni',era='2020s',formations=['4-4-2','4-3-3'],style='Flexible pressing',possession=.70,press=.80,attack=.70),
]
# Order: pace, shooting, passing, dribbling, defending, physical.
ROLE_WEIGHTS={
 'CB':(.12,.02,.12,.05,.48,.21),
 'LB':(.23,.03,.22,.12,.28,.12),'RB':(.23,.03,.22,.12,.28,.12),
 'LWB':(.25,.08,.24,.15,.18,.10),'RWB':(.25,.08,.24,.15,.18,.10),
 'CDM':(.08,.04,.28,.10,.32,.18),
 'CM':(.10,.10,.35,.22,.13,.10),
 'CAM':(.10,.22,.35,.25,.02,.06),
 'LM':(.26,.13,.27,.23,.03,.08),'RM':(.26,.13,.27,.23,.03,.08),
 'LW':(.29,.23,.18,.24,.01,.05),'RW':(.29,.23,.18,.24,.01,.05),
 'CF':(.16,.33,.22,.23,.01,.05),'ST':(.21,.43,.10,.14,.01,.11),
}
ADJACENCY={'LB':{'LWB'},'RB':{'RWB'},'LWB':{'LB','LM'},'RWB':{'RB','RM'},'CDM':{'CM','CB'},'CM':{'CDM','CAM'},'CAM':{'CM','CF'},'LM':{'LW','LWB'},'RM':{'RW','RWB'},'LW':{'LM'},'RW':{'RM'},'CF':{'ST','CAM'},'ST':{'CF'},'CB':{'CDM'}}
DEF={'CB','LB','RB','LWB','RWB'}
MID={'CDM','CM','CAM','LM','RM'}
ATT={'ST','CF','LW','RW'}

@dataclass(frozen=True)
class Config:
    temperature:float=10.0
    min_fit:float=.85
    chemistry_weight:float=2.0
    tactical_weight:float=2.5
    role_scale:float=20.0
    base_goals:float=1.35
    home_advantage:float=.12
    default_stamina:float=78.0
    fatigue:float=.08
    auto_subs:bool=True
    salary_cap:float|None=None
    opponent_difficulty:float=1.0
    def __post_init__(self):
        for key,value in asdict(self).items():
            if key=='salary_cap' and value is None:continue
            if key=='auto_subs':
                if not isinstance(value,bool):raise ValueError('auto_subs must be true or false.')
                continue
            if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value):raise ValueError(f'{key} must be finite.')
        if self.temperature<=0 or self.role_scale<=0 or self.base_goals<=0:raise ValueError('Temperature, role_scale, and base_goals must be positive.')
        if not .5<=self.min_fit<=1 or min(self.chemistry_weight,self.tactical_weight,self.fatigue)<0 or not 0<=self.default_stamina<=99 or not -.5<=self.home_advantage<=.5:raise ValueError('Config value is outside its supported range.')
        if self.salary_cap is not None and self.salary_cap<=0:raise ValueError('Salary cap must be positive.')
        if not .5<=self.opponent_difficulty<=2:raise ValueError('Opponent difficulty must be between 0.5 and 2.')

def card_tier(player):
    return 'S' if player['overall']>=90 else 'A' if player['overall']>=85 else 'B'

def card_cost(player):
    return max(1.,(player['overall']-60)/2)

def _constrained_awards(score,fit,pool,cfg,tier_limits,tier_quotas):
    """Enforce cap/quotas and one person per slot in one binary assignment."""
    count=len(pool);rows=score.shape[0];variables=rows*count
    index=np.arange(variables).reshape(rows,count)
    constraints=[coo_matrix((np.ones(variables),(np.repeat(np.arange(rows),count),index.ravel())),shape=(rows,variables)),
                 coo_matrix((np.ones(variables),(np.tile(np.arange(count),rows),index.ravel())),shape=(count,variables))]
    lower=[*([1]*rows),*([0]*count)];upper=[*([1]*rows),*([1]*count)]
    if cfg.salary_cap is not None:
        constraints.append(coo_matrix(np.tile([card_cost(p) for p in pool],rows).reshape(1,-1)));lower.append(0);upper.append(cfg.salary_cap)
    for tier,limit in (tier_limits or {}).items():
        constraints.append(coo_matrix(np.tile([card_tier(p)==tier for p in pool],rows).reshape(1,-1)));lower.append(0);upper.append(limit)
    for tier,quota in (tier_quotas or {}).items():
        constraints.append(coo_matrix(np.tile([card_tier(p)==tier for p in pool],rows).reshape(1,-1)));lower.append(quota);upper.append(quota)
    result=milp(-score.ravel(),integrality=np.ones(variables),bounds=Bounds(np.zeros(variables),(fit>=cfg.min_fit).ravel().astype(float)),
                constraints=LinearConstraint(vstack(constraints).tocsc(),lower,upper),options={'time_limit':10})
    if not result.success:return None
    chosen=np.argmax(result.x.reshape(rows,count),axis=1)
    return chosen

def era_eligibility(players, config=None):
    """Check exact matching feasibility before an era enters random selection."""
    cfg=config or Config(); report={}
    for era in ERAS:
        pool=[p for p in players if era=='All eras' or (era=='Legends' and 'icon-reconstruction' in p['lineage']) or p['era']==era]
        groups={}
        for p in pool:groups.setdefault(p['identity'],[]).append(p)
        compatible=[]
        for m in MANAGERS:
            if era not in ['All eras','Legends'] and m['era']!=era:continue
            for formation in m['formations']:
                slots=[s[0] for s in FORMATIONS[formation]]+['BENCH_GK','BENCH_DEF','BENCH_MID','BENCH_ATT']
                fits=np.array([[max(_group_fit(p,s) for p in cards) for cards in groups.values()] for s in slots])
                if len(groups)<15:continue
                rr,cc=linear_sum_assignment(fits>=cfg.min_fit,maximize=True)
                if len(rr)==15 and np.all(fits[rr,cc]>=cfg.min_fit):compatible.append(dict(manager=m['name'],formation=formation))
        report[era]=dict(eligible=bool(compatible),people=len(groups),compatible=compatible,
                         reason='' if compatible else 'Insufficient distinct people or role coverage for an eleven and GK/defence/midfield/attack reserves.')
    report['Classics']=dict(eligible=False,people=len({p['identity'] for p in players if p['era']=='Classics'}),compatible=[],reason='Pre-1990 subset lacks full formation coverage. Its players remain available in Legends and All eras.')
    return report

def choose_era(players,seed,weights=None,config=None):
    """Sample an eligible single-era pool using explicit nonnegative weights."""
    report=era_eligibility(players,config)
    eligible=[e for e in ERAS if e!='All eras' and report[e]['eligible']]
    weights=weights if weights is not None else {e:1.0 for e in eligible}
    if not isinstance(weights,dict) or any(e not in eligible for e in weights):raise ValueError('Random era weights must refer to eligible single-era pools.')
    values=np.array([weights.get(e,0) for e in eligible],dtype=float)
    if not np.isfinite(values).all() or (values<0).any() or values.sum()<=0:raise ValueError('Random era weights must be finite, nonnegative, with a positive total.')
    return str(np.random.default_rng(seed).choice(eligible,p=values/values.sum()))

def position_fit(player,slot):
    positions=set(player['positions'])
    if slot in positions:return 1.0
    if slot=='GK' or 'GK' in positions:return 0.0
    if positions & ADJACENCY.get(slot,set()):return .88
    if slot in DEF and positions&DEF:return .68
    if slot in MID and positions&MID:return .72
    if slot in ATT and positions&ATT:return .72
    return .45

def role_score(player,slot,weights=None):
    fit=position_fit(player,slot)
    if slot=='GK':
        if fit==0:return 0.
        value=sum(player[k]*w for k,w in [('gk_diving',.2),('gk_handling',.18),('gk_kicking',.1),('gk_reflexes',.3),('gk_positioning',.22)])
    elif 'GK' in player['positions']:return 0.
    else:
        w=np.asarray((weights or ROLE_WEIGHTS)[slot],dtype=float)
        if w.shape!=(6,) or not np.isfinite(w).all() or (w<0).any() or w.sum()<=0:raise ValueError('Role weights require six finite nonnegative values and positive total.')
        w=w/w.sum()
        value=float(np.dot(w,[player[k] for k in OUTFIELD]))
    return float(value*fit)

def _group_fit(p,group):
    slots={'BENCH_GK':['GK'],'BENCH_DEF':sorted(DEF),'BENCH_MID':sorted(MID),'BENCH_ATT':sorted(ATT)}.get(group,[group])
    return max(position_fit(p,s) for s in slots)

class DraftGame:
    def __init__(self,players,era='All eras',seed=42,config=None,tier_limits=None,tier_quotas=None,pool_eras=None):
        self.config=config or Config()
        validate_players(players)
        if era not in ERAS:raise ValueError(f'Choose an era from {ERAS}.')
        if isinstance(seed,bool) or not isinstance(seed,(int,np.integer)) or seed<0:raise ValueError('Seed must be a nonnegative integer.')
        self.seed=int(seed);self.era=era;self.squad=[];self.batches=[]
        rng=np.random.default_rng(self.seed)
        pool=[deepcopy(p) for p in sorted(players,key=lambda p:p['id']) if (p['era'] in pool_eras if pool_eras else era=='All eras' or (era=='Legends' and 'icon-reconstruction' in p['lineage']) or p['era']==era)]
        # Select one card per person before constructing the random role assignment.
        groups={}
        for p in pool:groups.setdefault(p['identity'],[]).append(p)
        pool=[cards[int(rng.integers(len(cards)))] for _,cards in sorted(groups.items())]
        if len(pool)<15:raise ValueError('This era needs at least fifteen distinct people.')
        candidates=[m for m in MANAGERS if era in ['All eras','Legends'] or m['era']==era]
        candidates=sorted(candidates,key=lambda m:m['name'])
        order=rng.permutation(len(candidates))
        for idx in order:
            m=deepcopy(candidates[int(idx)])
            for formation in rng.permutation(m['formations']):
                slots=[s[0] for s in FORMATIONS[formation]]+['BENCH_GK','BENCH_DEF','BENCH_MID','BENCH_ATT']
                fit=np.array([[_group_fit(p,s) for p in pool] for s in slots])
                rating=np.array([[p['overall'] for p in pool] for s in slots])
                score=rating+self.config.temperature*rng.gumbel(size=fit.shape)
                score[fit<self.config.min_fit]=-1e9
                rr,cc=linear_sum_assignment(score,maximize=True)
                if self.config.salary_cap is not None or tier_limits or tier_quotas:
                    cc=_constrained_awards(score,fit,pool,self.config,tier_limits,tier_quotas)
                    if cc is None:continue
                    rr=np.arange(15)
                if len(rr)==15 and np.all(fit[rr,cc]>=self.config.min_fit):
                    chosen=[pool[int(j)] for j in cc]
                    self._awards=[chosen[int(i)] for i in rng.permutation(15)]
                    self.manager=m;self.formation=str(formation);return
        raise ValueError('This pool cannot cover a manager formation and four reserve groups. Add the missing roles or choose All eras.')

    @property
    def complete(self):return len(self.squad)==15

    def spin(self):
        if self.complete:raise ValueError('The squad is complete. Start a new draft to spin again.')
        batch=deepcopy(self._awards[len(self.squad):len(self.squad)+3])
        self.squad.extend(batch);self.batches.append(batch)
        return deepcopy(batch)

    def lineup(self,formation=None,weights=None):
        if not self.complete:raise ValueError('Complete all five spins before selecting the starting eleven.')
        formation=formation or self.formation
        if formation not in self.manager['formations']:raise ValueError('The drawn manager does not support this formation.')
        return assign_lineup(self.squad,formation,self.manager,self.config,weights)

def assign_lineup(squad,formation='4-3-3',manager=None,config=None,weights=None):
    cfg=config or Config()
    validate_players(squad)
    if len(squad)!=15 or len({p['identity'] for p in squad})!=15:raise ValueError('A team must contain fifteen different people.')
    if formation not in FORMATIONS:raise ValueError('Unsupported formation.')
    ps=sorted(squad,key=lambda p:p['id']);slots=FORMATIONS[formation]
    matrix=np.array([[role_score(p,s[0],weights) if position_fit(p,s[0])>=cfg.min_fit else -1e9 for p in ps] for s in slots])
    rr,cc=linear_sum_assignment(matrix,maximize=True)
    if len(rr)!=11 or (matrix[rr,cc]<0).any():raise ValueError('The squad cannot fill this formation at the configured minimum role fit.')
    used=set(int(j) for j in cc)
    starters=[dict(slot=slots[int(i)][0],x=slots[int(i)][1],y=slots[int(i)][2],player=deepcopy(ps[int(j)]),fit=position_fit(ps[int(j)],slots[int(i)][0]),role_score=float(matrix[int(i),int(j)])) for i,j in zip(rr,cc)]
    return dict(formation=formation,manager=deepcopy(manager or MANAGERS[0]),starters=starters,bench=[deepcopy(p) for j,p in enumerate(ps) if j not in used],config=asdict(cfg),role_weights=deepcopy(weights or ROLE_WEIGHTS))

def swap_player(team,slot_index,bench_id):
    out=deepcopy(team)
    if isinstance(slot_index,bool) or not isinstance(slot_index,int) or not 0<=slot_index<11:raise ValueError('Choose a starting slot from 0 to 10.')
    bench_index=next((i for i,p in enumerate(out['bench']) if p['id']==bench_id),None)
    if bench_index is None:raise ValueError('That player is not on the bench.')
    slot=out['starters'][slot_index];incoming=out['bench'][bench_index]
    cfg=Config(**out['config'])
    fit=position_fit(incoming,slot['slot'])
    if fit<cfg.min_fit:raise ValueError('This substitution does not meet the minimum role fit.')
    out['bench'][bench_index]=slot['player'];slot['player']=incoming
    slot['fit']=fit;slot['role_score']=role_score(incoming,slot['slot'],out.get('role_weights'))
    return out

def rate_team(team,config=None):
    cfg=config or Config(**team.get('config',{}))
    ss=team['starters'];outfield=[s for s in ss if s['slot']!='GK']
    attack_slots=[s for s in outfield if s['slot'] in ATT|{'CAM'}]
    middle=[s for s in outfield if s['slot'] in MID|{'LWB','RWB'}]
    back=[s for s in outfield if s['slot'] in DEF|{'CDM'}]
    attack=float(np.mean([(.55*s['player']['shooting']+.2*s['player']['pace']+.25*s['player']['dribbling'])*s['fit'] for s in attack_slots]))
    control=float(np.mean([(.65*s['player']['passing']+.35*s['player']['dribbling'])*s['fit'] for s in middle]))
    defending=float(np.mean([(.72*s['player']['defending']+.28*s['player']['physical'])*s['fit'] for s in back]))
    keeper=next(s['role_score'] for s in ss if s['slot']=='GK')
    defence=.78*defending+.22*keeper
    m=team['manager']
    avg_pass=np.mean([s['player']['passing'] for s in outfield]);avg_phys=np.mean([s['player']['physical'] for s in outfield]);avg_pace=np.mean([s['player']['pace'] for s in outfield])
    tactical=float(m['possession']*(avg_pass-75)/20+m['press']*(avg_phys-75)/25+(1-m['possession'])*(avg_pace-75)/20)
    # Every pair is scored; links are design proxies, not observed chemistry effects.
    links=[]
    for i,a in enumerate(outfield):
        for b in outfield[i+1:]:
            pa,pb=a['player'],b['player']
            continuity=(.35 if pa.get('nation')==pb.get('nation') and pa.get('nation') not in [None,'Unknown','nan'] else 0)+(.35 if pa.get('club')==pb.get('club') and pa.get('club') not in [None,'Legends','Free agent','Unknown','nan'] else 0)
            complement=.3*max(pa['passing']*pb['shooting'],pb['passing']*pa['shooting'])/9801
            distance=math.hypot(a['x']-b['x'],a['y']-b['y'])
            links.append(dict(a=pa['id'],b=pb['id'],value=float((continuity+complement)*math.exp(-distance/45))))
    chemistry=float(np.mean([l['value'] for l in links])*10)
    bonus=cfg.chemistry_weight*chemistry/10+cfg.tactical_weight*tactical
    missing=[s['player']['name'] for s in outfield if s['player'].get('stamina') is None]
    stamina=float(np.mean([s['player'].get('stamina') if s['player'].get('stamina') is not None else cfg.default_stamina for s in outfield]))
    return dict(attack=attack+bonus,control=control+bonus,defence=defence+bonus,keeper=keeper,role_quality=float(np.mean([s['role_score'] for s in ss])),role_fit=float(np.mean([s['fit'] for s in ss])),chemistry=chemistry,tactical_fit=tactical,stamina=stamina,stamina_fallbacks=missing,links=links,model='uncalibrated attributes + tactical/chemistry proxies')

def _half_team(team,cfg):
    out=deepcopy(team);subs=[]
    if cfg.auto_subs:
        candidates=[(s['player'].get('stamina') if s['player'].get('stamina') is not None else cfg.default_stamina,i) for i,s in enumerate(out['starters']) if s['slot']!='GK']
        used=set()
        for stamina,i in sorted(candidates):
            if len(subs)==3:break
            s=out['starters'][i]
            opts=[p for p in out['bench'] if p['id'] not in used and position_fit(p,s['slot'])>=cfg.min_fit]
            if not opts:continue
            fresh=max(opts,key=lambda p:role_score(p,s['slot']))
            loss=cfg.fatigue*(1+(99-stamina)/40)
            if role_score(fresh,s['slot'])>=s['role_score']*(1-loss):
                previous=s['player']['name'];incoming_id=fresh['id']
                out=swap_player(out,i,incoming_id)
                # Players taken off are not eligible to return in this match.
                used.add(team['starters'][i]['player']['id'])
                subs.append(dict(minute=60,out=previous,player=fresh['name'],type='Substitution'))
    return out,subs

def match_rates(home,away,config=None,home_advantage=None):
    cfg=config or Config(**home.get('config',{}))
    advantage=cfg.home_advantage if home_advantage is None else float(home_advantage)
    if not math.isfinite(advantage) or not -.5<=advantage<=.5:raise ValueError('Home advantage must be between -0.5 and 0.5.')
    h0=rate_team(home,cfg);a0=rate_team(away,cfg)
    h1,hs=_half_team(home,cfg);a1,asubs=_half_team(away,cfg)
    stages=[]
    for start,end,hteam,ateam in [(0,60,home,away),(60,90,h1,a1)]:
        h=rate_team(hteam,cfg);a=rate_team(ateam,cfg)
        if start==60:
            for score in [h,a]:
                fresh_count=len(hs) if score is h else len(asubs)
                factor=1-cfg.fatigue*(1+(99-score['stamina'])/40)*(1-fresh_count/10)
                for k in ['attack','control','defence']:score[k]*=max(.65,factor)
        from .analytics import expected_rates
        home_rate,away_rate=expected_rates(h,a,cfg,advantage=advantage,duration=end-start)
        stages.append(dict(start=start,end=end,home_xg=home_rate,away_xg=away_rate*cfg.opponent_difficulty,home=hteam,away=ateam))
    return dict(home_xg=sum(s['home_xg'] for s in stages),away_xg=sum(s['away_xg'] for s in stages),stages=stages,home_subs=hs,away_subs=asubs,home_rating=h0,away_rating=a0)

def simulate_match(home,away,seed=100,config=None,home_advantage=None):
    rates=match_rates(home,away,config,home_advantage)
    rng=np.random.default_rng(seed);events=[];realized_xg={'home':0.,'away':0.};goals={'home':0,'away':0};shots={'home':0,'away':0}
    for side,key in [('home','home_subs'),('away','away_subs')]:
        events.extend([dict(s,side=side) for s in rates[key]])
    # Poisson shots + independent Bernoulli marks is a Poisson goal process.
    for stage in rates['stages']:
        for side in ['home','away']:
            team=stage[side];players=[s['player'] for s in team['starters'] if s['slot']!='GK']
            chance_weights=np.array([max(1,p['shooting']-25)**2 for p in players]);chance_weights=chance_weights/chance_weights.sum()
            for _ in range(int(rng.poisson(stage[side+'_xg']/.12))):
                p=players[int(rng.choice(len(players),p=chance_weights))]
                q=float(rng.beta(2,2/.12-2))
                goal=bool(rng.random()<q)
                minute=int(rng.integers(stage['start']+1,stage['end']+1))
                events.append(dict(minute=minute,side=side,type='Goal' if goal else 'Shot',player=p['name'],xg=q))
                shots[side]+=1;realized_xg[side]+=q;goals[side]+=int(goal)
    # At the same clock minute, order end-of-segment shots before substitutions.
    events.sort(key=lambda e:(e['minute'],e['type']=='Substitution',e['side']))
    h=rates['home_rating'];a=rates['away_rating']
    possession=float(100/(1+np.exp(-(h['control']-a['control'])/18)))
    return dict(home_goals=goals['home'],away_goals=goals['away'],home_xg=float(realized_xg['home']),away_xg=float(realized_xg['away']),expected_home_goals=rates['home_xg'],expected_away_goals=rates['away_xg'],home_shots=shots['home'],away_shots=shots['away'],home_possession=possession,away_possession=100-possession,events=events,seed=int(seed),label='Simulated match; model settings are not fitted to results')

def simulate_series(home,away,n=2000,seed=100,config=None,home_advantage=None):
    if isinstance(n,bool) or not isinstance(n,int) or not 1<=n<=200000:raise ValueError('Trials must be an integer from 1 to 200000.')
    rates=match_rates(home,away,config,home_advantage)
    rng=np.random.default_rng(seed)
    hg=rng.poisson(rates['home_xg'],n);ag=rng.poisson(rates['away_xg'],n)
    counts=dict(wins=int(np.sum(hg>ag)),draws=int(np.sum(hg==ag)),losses=int(np.sum(hg<ag)))
    probs={k:v/n for k,v in counts.items()}
    intervals={k:[max(0,p-1.96*math.sqrt(p*(1-p)/n)),min(1,p+1.96*math.sqrt(p*(1-p)/n))] for k,p in probs.items()}
    return dict(**counts,trials=n,probabilities=probs,sampling_intervals=intervals,home_xg=rates['home_xg'],away_xg=rates['away_xg'],home_goal_mean=float(hg.mean()),away_goal_mean=float(ag.mean()),seed=int(seed),interval_note='Approximate 95% Monte Carlo sampling intervals; exclude model uncertainty.')

def simulate_season(team,opponents,seed=100,config=None):
    if not opponents:raise ValueError('Provide at least one opponent.')
    rng=np.random.default_rng(seed);rows=[];run=best=points=0
    for i,other in enumerate(opponents):
        result=simulate_match(team,other,seed=int(rng.integers(2**31)),config=config,home_advantage=0)
        h,a=result['home_goals'],result['away_goals'];outcome='W' if h>a else 'D' if h==a else 'L'
        points+=3 if outcome=='W' else 1 if outcome=='D' else 0
        run=run+1 if outcome!='L' else 0;best=max(best,run)
        rows.append(dict(match=i+1,opponent=other['manager']['name'],outcome=outcome,goals_for=h,goals_against=a,xg_for=result['home_xg'],xg_against=result['away_xg']))
    return dict(matches=rows,wins=sum(r['outcome']=='W' for r in rows),draws=sum(r['outcome']=='D' for r in rows),losses=sum(r['outcome']=='L' for r in rows),points=points,best_unbeaten=best,label='Synthetic drafted opponents; not historical club-season fixtures.')
