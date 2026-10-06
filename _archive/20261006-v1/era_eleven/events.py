"""Analyze local StatsBomb events; raw files are never bundled or published."""
from pathlib import Path
import json
import urllib.request
import numpy as np
import pandas as pd

SOURCE='https://github.com/statsbomb/open-data'
LICENSE='https://github.com/statsbomb/open-data/blob/master/LICENSE.pdf'
LOGO='https://raw.githubusercontent.com/statsbomb/open-data/master/img/SB%20-%20Icon%20Lockup%20-%20Colour%20positive.png'

def load_statsbomb(match_id=3869685,cache_dir=None):
    if not isinstance(match_id,int) or match_id<=0:raise ValueError('match_id must be a positive integer.')
    if cache_dir is None:raise ValueError('Provide a persistent local cache_dir; raw data is excluded from Git.')
    cache=Path(cache_dir);cache.mkdir(parents=True,exist_ok=True)
    path=cache/f'statsbomb-{match_id}.json'
    if not path.exists():
        url=f'https://raw.githubusercontent.com/statsbomb/open-data/master/data/events/{match_id}.json'
        request=urllib.request.Request(url,headers={'User-Agent':'EraElevenResearch/0.1'})
        with urllib.request.urlopen(request,timeout=45) as response:data=response.read()
        events=json.loads(data)
        if not isinstance(events,list):raise ValueError('Provider response is not a list of events.')
        path.write_bytes(data)
    return json.loads(path.read_text(encoding='utf-8'))

def event_metrics(events):
    events=[e for e in events if e.get('period',1)<=4]
    if not events:raise ValueError('No regulation or extra-time events were supplied.')
    shots={e['id']:e for e in events if e.get('type',{}).get('name')=='Shot' and 'id' in e}
    rows={};starts={};ends={};period_end=120 if any(e.get('period',1)>=3 for e in events) else 90
    def add(pid,name,team):
        if pid not in rows:rows[pid]=dict(player_id=pid,player=name,team=team,xg=0.,npxg=0.,xa=0.,goals=0,shots=0,passes=0,completed_passes=0,forward_moves_10m=0,pressures=0,interceptions=0)
        return rows[pid]
    for e in events:
        kind=e.get('type',{}).get('name');team=e.get('team',{}).get('name','Unknown')
        if kind=='Starting XI':
            for item in e.get('tactics',{}).get('lineup',[]):
                p=item['player'];starts[p['id']]=0;add(p['id'],p['name'],team)
        p=e.get('player')
        if not p:continue
        row=add(p['id'],p['name'],team)
        if kind=='Substitution':
            minute=min(period_end,float(e.get('minute',0))+e.get('second',0)/60)
            ends[p['id']]=minute
            q=e.get('substitution',{}).get('replacement')
            if q:starts[q['id']]=minute;add(q['id'],q['name'],team)
        if kind=='Shot':
            shot=e.get('shot',{});xg=float(shot.get('statsbomb_xg',0));row['xg']+=xg;row['shots']+=1
            if shot.get('type',{}).get('name')!='Penalty':row['npxg']+=xg
            row['goals']+=int(shot.get('outcome',{}).get('name')=='Goal')
        elif kind=='Pass':
            pas=e.get('pass',{});row['passes']+=1
            success='outcome' not in pas;row['completed_passes']+=int(success)
            target=shots.get(pas.get('assisted_shot_id'))
            if target is not None and target.get('team',{}).get('name')==team:row['xa']+=float(target.get('shot',{}).get('statsbomb_xg',0))
            start=e.get('location');end=pas.get('end_location')
            if success and start and end and (end[0]-start[0])*105/120>=10:row['forward_moves_10m']+=1
        elif kind=='Carry':
            start=e.get('location');end=e.get('carry',{}).get('end_location')
            if start and end and (end[0]-start[0])*105/120>=10:row['forward_moves_10m']+=1
        elif kind=='Pressure':row['pressures']+=1
        elif kind=='Interception':row['interceptions']+=1
        card=e.get('bad_behaviour',{}).get('card',{}).get('name') or e.get('foul_committed',{}).get('card',{}).get('name')
        if card in ['Red Card','Second Yellow']:ends[p['id']]=min(period_end,float(e.get('minute',0)))
    for pid,r in rows.items():
        r['scheduled_minutes']=max(0,ends.get(pid,period_end)-starts[pid]) if pid in starts else None
        r['pass_completion']=r['completed_passes']/r['passes'] if r['passes'] else None
        r['xg_per90']=r['xg']*90/r['scheduled_minutes'] if r['scheduled_minutes'] else None
        r['xa_per90']=r['xa']*90/r['scheduled_minutes'] if r['scheduled_minutes'] else None
    frame=pd.DataFrame(rows.values()).sort_values(['xg','player'],ascending=[False,True]).reset_index(drop=True)
    frame.attrs.update(source=SOURCE,minutes='Scheduled playing minutes; includes extra time, excludes stoppage time.',progression='Completed pass or carry with forward x displacement at least 10 metres; not the FBref progressive-pass definition.',scope='Periods 1-4 only; shootout excluded; penalties included in xG and excluded from npxG.')
    return frame

def fit_expected_threat(events,nx=16,ny=12,tolerance=1e-10,max_iter=500):
    """Solve Singh's xT fixed point with failed moves treated as possession loss."""
    if not isinstance(nx,int) or not isinstance(ny,int) or not 1<=nx<=32 or not 1<=ny<=24:raise ValueError('Grid must be 1..32 by 1..24.')
    count=nx*ny;shots=np.zeros(count);goals=np.zeros(count);moves=np.zeros(count);transitions=np.zeros((count,count))
    def zone(loc):return min(ny-1,max(0,int(loc[1]/80*ny)))*nx+min(nx-1,max(0,int(loc[0]/120*nx)))
    for e in events:
        if e.get('period',1)>4 or not e.get('location'):continue
        kind=e.get('type',{}).get('name');z=zone(e['location'])
        if kind=='Shot':
            shots[z]+=1;goals[z]+=int(e.get('shot',{}).get('outcome',{}).get('name')=='Goal')
        elif kind in ['Pass','Carry']:
            move=e.get(kind.lower(),{});end=move.get('end_location')
            if end is None:continue
            moves[z]+=1
            if 'outcome' not in move:transitions[z,zone(end)]+=1
    actions=shots+moves
    shoot=np.divide(shots,actions,out=np.zeros(count),where=actions>0)
    move_prob=np.divide(moves,actions,out=np.zeros(count),where=actions>0)
    goal_prob=np.divide(goals,shots,out=np.zeros(count),where=shots>0)
    t=np.divide(transitions,moves[:,None],out=np.zeros_like(transitions),where=moves[:,None]>0)
    v=np.zeros(count);converged=False
    for iteration in range(1,max_iter+1):
        new=shoot*goal_prob+move_prob*(t@v)
        error=float(np.max(abs(new-v)));v=new
        if error<tolerance:converged=True;break
    return dict(grid=v.reshape(ny,nx).tolist(),iterations=iteration,converged=converged,residual=error,occupied_zones=int((actions>0).sum()),total_zones=count,source='Karun Singh, Introducing Expected Threat, https://karun.in/blog/expected-threat.html',restriction='Empirical goal frequency; failed moves absorb possession. Sparse cells are zero, with no smoothing. A single-match field is illustrative only.')
