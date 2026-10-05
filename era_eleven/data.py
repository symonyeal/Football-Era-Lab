"""Load attributed ratings and normalize user-supplied EA or PES exports."""
from pathlib import Path
import json
import math
import re
import unicodedata
import pandas as pd

ROOT=Path(__file__).resolve().parents[1]
POSITIONS={'GK','CB','LB','RB','LWB','RWB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST'}
OUTFIELD=('pace','shooting','passing','dribbling','defending','physical')
KEEPER=('gk_diving','gk_handling','gk_kicking','gk_reflexes','gk_speed','gk_positioning')

def validate_players(players):
    if not players:raise ValueError('The player pool is empty.')
    ids=set()
    for p in players:
        for key in ['id','identity','name','positions','overall','source','lineage','era']:
            if key not in p or p[key] is None:raise ValueError(f'Player is missing {key}.')
        if not isinstance(p['id'],str) or not p['id'] or p['id'] in ids:raise ValueError('Player card IDs must be unique nonempty strings.')
        ids.add(p['id'])
        if not isinstance(p['identity'],str) or not p['identity']:raise ValueError('A player identity is required.')
        if not isinstance(p['positions'],list) or not p['positions'] or not set(p['positions'])<=POSITIONS:raise ValueError(f"Unsupported positions for {p['name']}.")
        required=KEEPER[:4]+KEEPER[5:] if 'GK' in p['positions'] else OUTFIELD
        for key in ('overall',)+required:
            v=p.get(key)
            if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not 0<=v<=99:raise ValueError(f"{p['name']}: {key} must be a finite rating from 0 to 99.")
        for key in ('stamina','vision','finishing'):
            v=p.get(key)
            if v is not None and (not isinstance(v,(int,float)) or not math.isfinite(v) or not 0<=v<=99):raise ValueError(f'Invalid {key}.')
    return players

def load_players(path=None):
    return validate_players(json.loads(Path(path or ROOT/'data'/'players.json').read_text(encoding='utf-8')))

def _identity(name):
    text=unicodedata.normalize('NFKD',str(name)).encode('ascii','ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+','-',text).strip('-')

def _number(value):
    return None if pd.isna(value) or str(value).strip()=='' else float(value)

def import_ea_csv(path,era='2020s',edition=None,min_overall=0):
    """Read a SoFIFA/EA career export; missing detailed attributes stay missing."""
    df=pd.read_csv(path)
    required={'player_positions','overall'}
    if not required<=set(df):raise ValueError('EA export needs player_positions and overall columns.')
    if not any(c in df for c in ['short_name','long_name','name']):raise ValueError('EA export needs a player name column.')
    if edition is not None:
        if 'fifa_version' not in df:raise ValueError('This export has no fifa_version column to filter.')
        df=df[df.fifa_version==edition]
    rows=[]
    for _,r in df.iterrows():
        if _number(r.overall) is None:raise ValueError('EA overall cannot be missing.')
        if r.overall<min_overall:continue
        name=next(r[c] for c in ['short_name','long_name','name'] if c in df and pd.notna(r[c]))
        pid=str(int(r.player_id)) if 'player_id' in df and pd.notna(r.player_id) else _identity(name)
        version=str(r.get('fifa_version',edition or 'import'))
        p=dict(id=f'ea-{pid}-{version}',identity=f'ea-{pid}',name=str(name),positions=[x.strip() for x in r.player_positions.split(',')],overall=_number(r.overall),nation=str(r.get('nationality_name','Unknown')),club=str(r.get('club_name','Unknown')),league=str(r.get('league_name','Imported')),era=era,season=f'EA/FIFA {version}',source='user-ea-csv',lineage='user-published-snapshot',source_date=str(r.get('update_as_of','unspecified')),era_basis='user-specified era')
        for key in OUTFIELD+KEEPER+('stamina','vision','finishing'):
            col={'physical':'physic','stamina':'power_stamina','vision':'mentality_vision','finishing':'attacking_finishing'}.get(key,key.replace('gk_','goalkeeping_'))
            p[key]=_number(r.get(col))
        rows.append(p)
    return validate_players(rows)

def import_pes_csv(path,era='2020s'):
    """Map a PES export to comparable groups; record the mapping as a proxy."""
    df=pd.read_csv(path)
    df.columns=[re.sub(r'[^a-z0-9]+','_',c.lower()).strip('_') for c in df.columns]
    if not {'name','position','overall'}<=set(df):raise ValueError('PES export needs Name, Position, and Overall columns.')
    posmap={'DMF':'CDM','CMF':'CM','AMF':'CAM','LMF':'LM','RMF':'RM','LWF':'LW','RWF':'RW','SS':'CF','CF':'ST'}
    groups={'pace':['speed','acceleration'],'shooting':['finishing','kicking_power'],'passing':['low_pass','lofted_pass'],'dribbling':['dribbling','ball_control','tight_possession'],'defending':['defensive_awareness','ball_winning'],'physical':['physical_contact','balance'],'gk_diving':['gk_reach'],'gk_handling':['gk_catching'],'gk_kicking':['low_pass'],'gk_reflexes':['gk_reflexes'],'gk_speed':['speed'],'gk_positioning':['gk_awareness']}
    rows=[]
    for _,r in df.iterrows():
        pid=str(r.get('id',_identity(r['name'])))
        p=dict(id='pes-'+pid,identity='pes-'+pid,name=str(r['name']),positions=[posmap.get(x.strip(),x.strip()) for x in re.split(r'[,/]',r.position)],overall=_number(r.overall),nation=str(r.get('nationality','Unknown')),club=str(r.get('team','Unknown')),league='Imported PES',era=era,season='PES user import',source='user-pes-csv',lineage='pes-group-proxy',source_date='unspecified',era_basis='user-specified era',attribute_mapping=groups)
        for key,cols in groups.items():
            vals=[_number(r.get(c)) for c in cols]
            vals=[v for v in vals if v is not None]
            p[key]=sum(vals)/len(vals) if vals else None
        p.update(stamina=_number(r.get('stamina')),vision=None,finishing=_number(r.get('finishing')))
        rows.append(p)
    return validate_players(rows)
