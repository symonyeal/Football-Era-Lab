"""Load attributed ratings and normalize user-supplied EA or PES exports."""
from pathlib import Path
from copy import deepcopy
from decimal import Decimal, InvalidOperation
from hashlib import sha256, file_digest
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
    ids=set();birth_dates={}
    for p in players:
        for key in ['id','identity','name','positions','overall','source','lineage','era']:
            if key not in p or p[key] is None:raise ValueError(f'Player is missing {key}.')
        for key in ('name','source','lineage','era'):
            if not isinstance(p[key],str) or not p[key].strip():raise ValueError(f'Player {key} must be nonempty text.')
        if not isinstance(p['id'],str) or not p['id'] or p['id'] in ids:raise ValueError('Player card IDs must be unique nonempty strings.')
        ids.add(p['id'])
        if not isinstance(p['identity'],str) or not p['identity']:raise ValueError('A player identity is required.')
        dob=_dob(p.get('dob',p.get('birth_date')))
        if dob:
            if p['identity'] in birth_dates and birth_dates[p['identity']]!=dob:
                raise ValueError(f"Identity {p['identity']} has conflicting birth dates; review the source IDs or identity override.")
            birth_dates[p['identity']]=dob
        if not isinstance(p['positions'],list) or not p['positions'] or not set(p['positions'])<=POSITIONS:raise ValueError(f"Unsupported positions for {p['name']}.")
        required=KEEPER[:4]+KEEPER[5:] if 'GK' in p['positions'] else OUTFIELD
        for key in ('overall',)+required:
            v=p.get(key)
            if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not 0<=v<=99:raise ValueError(f"{p['name']}: {key} must be a finite rating from 0 to 99.")
        for key in ('stamina','vision','finishing'):
            v=p.get(key)
            if v is not None and (isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not 0<=v<=99):raise ValueError(f'Invalid {key}.')
    return players

def load_players(path=None):
    return validate_players(json.loads(Path(path or ROOT/'data'/'players.json').read_text(encoding='utf-8')))

def _identity(name):
    text=unicodedata.normalize('NFKD',str(name)).encode('ascii','ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+','-',text).strip('-')

def _number(value):
    return None if pd.isna(value) or str(value).strip()=='' else float(value)

def _text(value,default=None):
    if value is None or pd.isna(value) or not str(value).strip():return default
    return str(value).strip()

def _provider_id(value):
    text=_text(value)
    if text is None:return None
    if isinstance(value,bool):raise ValueError('Provider IDs cannot be booleans.')
    try:
        numeric=Decimal(text)
    except InvalidOperation:
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:-]*',text):raise ValueError('Provider IDs must be stable source identifiers, not names.')
        return text
    if not numeric.is_finite() or numeric<0 or numeric!=numeric.to_integral_value():
        raise ValueError('Numeric provider IDs must be nonnegative integers; fractional IDs cannot be truncated.')
    return str(int(numeric))

def _dob(value):
    text=_text(value)
    if text is None:return None
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',text):raise ValueError('A reviewed birth date must use YYYY-MM-DD.')
    try:return pd.to_datetime(text,format='%Y-%m-%d',errors='raise').date().isoformat()
    except ValueError as exc:raise ValueError('Invalid birth date.') from exc

def _resolve_identity(provider,pid,row_index,row,overrides):
    key=f'{provider}-{pid}' if pid is not None else f'row:{row_index}'
    if overrides is not None and not isinstance(overrides,dict):raise ValueError('identity_overrides must be a dictionary of reviewed mappings.')
    mapping=(overrides or {}).get(key)
    dob=_dob(next((row.get(k) for k in ('dob','birth_date','date_of_birth') if _text(row.get(k))),None))
    nation=_text(row.get('nationality_name',row.get('nationality')),'Unknown')
    if mapping is not None:
        if not isinstance(mapping,dict) or not _text(mapping.get('identity')) or not _text(mapping.get('evidence')):
            raise ValueError('Every identity_overrides entry requires identity and nonempty evidence of the review.')
        reviewed_dob=_dob(mapping.get('dob'))
        if dob and reviewed_dob and dob!=reviewed_dob:raise ValueError(f'{key}: reviewed birth date conflicts with the source row.')
        reviewed_nation=_text(mapping.get('nation'))
        if nation!='Unknown' and reviewed_nation and _identity(nation)!=_identity(reviewed_nation):
            raise ValueError(f'{key}: reviewed nationality conflicts with the source row.')
        identity=str(mapping['identity']).strip()
        resolution=dict(status='reviewed override',key=key,evidence=str(mapping['evidence']).strip(),review=deepcopy(mapping))
    elif pid is None:
        raise ValueError(f'{provider} row {row_index} has no provider player ID. Add a source ID or identity_overrides["row:{row_index}"] with identity and reviewed evidence; names alone cannot identify a person.')
    else:
        identity=key
        resolution=dict(status='provider ID',key=key,evidence='Explicit identifier supplied by the export; no cross-provider merge.')
    return identity,resolution,dob,nation

def _mapping(default,overrides):
    if overrides is not None and not isinstance(overrides,dict):raise ValueError('attribute_mapping must map known attributes to source columns.')
    if set(overrides or {})-set(default):raise ValueError('attribute_mapping contains an unknown game attribute.')
    out={k:[v] if isinstance(v,str) else list(v) for k,v in default.items()}
    for key,columns in (overrides or {}).items():
        columns=[columns] if isinstance(columns,str) else columns
        if not isinstance(columns,(list,tuple)) or not columns or not all(isinstance(c,str) and c for c in columns):
            raise ValueError('Each attribute mapping needs one or more named source columns.')
        out[key]=list(columns)
    return out

def _attributes(player,row,mapping):
    missing={};completeness={}
    for key,columns in mapping.items():
        vals=[_number(row.get(c)) for c in columns]
        available=[v for v in vals if v is not None]
        player[key]=sum(available)/len(available) if available else None
        missing[key]=[c for c,v in zip(columns,vals) if v is None]
        completeness[key]=dict(available=len(available),expected=len(columns))
    player['attribute_mapping']=deepcopy(mapping)
    player['attribute_aggregation']='Arithmetic mean of available mapped columns; no fill values.'
    player['missing_source_columns']=missing
    player['attribute_completeness']=completeness
    player['missing_attributes']=[k for k in OUTFIELD+KEEPER+('stamina','vision','finishing') if player.get(k) is None]

def _file_hash(path):
    if not Path(path).is_file():return None
    with Path(path).open('rb') as source:return file_digest(source,'sha256').hexdigest()

def _provenance(player,path,metadata,row,source_hash):
    metadata=deepcopy(metadata or {})
    if not isinstance(metadata,dict):raise ValueError('source_metadata must be a dictionary.')
    try:json.dumps(metadata,allow_nan=False)
    except (TypeError,ValueError) as exc:raise ValueError('source_metadata must contain finite JSON-compatible values.') from exc
    for key in ('source','source_date','source_url','season','edition','lineage','era_basis','license'):
        if key in metadata:player[key]=deepcopy(metadata[key])
    player['source_metadata']=metadata
    player['source_file']=Path(path).name
    player['source_file_sha256']=source_hash
    player.setdefault('license',{'name':_text(row.get('license'),'unspecified'),'redistribution':'not established'})

def import_ea_csv(path,era='2020s',edition=None,min_overall=0,*,identity_overrides=None,source_metadata=None,attribute_mapping=None):
    """Read a SoFIFA/EA career export; missing detailed attributes stay missing."""
    df=pd.read_csv(path)
    required={'player_positions','overall'}
    if not required<=set(df):raise ValueError('EA export needs player_positions and overall columns.')
    if not any(c in df for c in ['short_name','long_name','name']):raise ValueError('EA export needs a player name column.')
    if edition is not None:
        if 'fifa_version' not in df:raise ValueError('This export has no fifa_version column to filter.')
        df=df[df.fifa_version==edition]
    if isinstance(min_overall,bool) or not isinstance(min_overall,(int,float)) or not math.isfinite(min_overall) or not 0<=min_overall<=99:
        raise ValueError('min_overall must be a finite rating from 0 to 99.')
    default={key:{'physical':'physic','stamina':'power_stamina','vision':'mentality_vision','finishing':'attacking_finishing'}.get(key,key.replace('gk_','goalkeeping_')) for key in OUTFIELD+KEEPER+('stamina','vision','finishing')}
    mapping=_mapping(default,attribute_mapping)
    source_hash=_file_hash(path)
    rows=[]
    for row_index,r in df.iterrows():
        if _number(r.overall) is None:raise ValueError('EA overall cannot be missing.')
        if r.overall<min_overall:continue
        name=next(r[c] for c in ['short_name','long_name','name'] if c in df and pd.notna(r[c]))
        pid=_provider_id(r.get('player_id'))
        identity,resolution,dob,nation=_resolve_identity('ea',pid,row_index,r,identity_overrides)
        card_pid=pid if pid is not None else 'reviewed-'+sha256(identity.encode()).hexdigest()[:16]
        version=_provider_id(r.get('fifa_version')) or str(edition or 'import')
        p=dict(id=f'ea-{card_pid}-{version}',identity=identity,name=str(name),full_name=_text(r.get('long_name',r.get('name'))),dob=dob,provider_player_id=pid,identity_resolution=resolution,positions=[x.strip() for x in r.player_positions.split(',')],overall=_number(r.overall),nation=nation,club=_text(r.get('club_name'),'Unknown'),league=_text(r.get('league_name'),'Imported'),era=era,season=_text(r.get('season'),f'EA/FIFA {version}'),edition=version,source='user-ea-csv',lineage='user-attribute-mapping-proxy' if attribute_mapping else 'user-supplied-snapshot',source_date=_text(r.get('update_as_of'),'unspecified'),era_basis='user-specified era')
        _attributes(p,r,mapping)
        _provenance(p,path,source_metadata,r,source_hash)
        rows.append(p)
    return validate_players(rows)

def import_pes_csv(path,era='2020s',*,edition=None,identity_overrides=None,source_metadata=None,attribute_mapping=None):
    """Map a PES export to comparable groups; record the mapping as a proxy."""
    df=pd.read_csv(path)
    df.columns=[re.sub(r'[^a-z0-9]+','_',c.lower()).strip('_') for c in df.columns]
    if not {'name','position','overall'}<=set(df):raise ValueError('PES export needs Name, Position, and Overall columns.')
    posmap={'DMF':'CDM','CMF':'CM','AMF':'CAM','LMF':'LM','RMF':'RM','LWF':'LW','RWF':'RW','SS':'CF','CF':'ST'}
    groups={'pace':['speed','acceleration'],'shooting':['finishing','kicking_power'],'passing':['low_pass','lofted_pass'],'dribbling':['dribbling','ball_control','tight_possession'],'defending':['defensive_awareness','ball_winning'],'physical':['physical_contact','balance'],'gk_diving':['gk_reach'],'gk_handling':['gk_catching'],'gk_kicking':['low_pass'],'gk_reflexes':['gk_reflexes'],'gk_speed':['speed'],'gk_positioning':['gk_awareness']}
    groups.update(stamina=['stamina'],vision=['vision'],finishing=['finishing'])
    groups=_mapping(groups,attribute_mapping)
    source_hash=_file_hash(path)
    rows=[]
    for row_index,r in df.iterrows():
        pid=_provider_id(r.get('id'))
        identity,resolution,dob,nation=_resolve_identity('pes',pid,row_index,r,identity_overrides)
        card_pid=pid if pid is not None else 'reviewed-'+sha256(identity.encode()).hexdigest()[:16]
        version=_text(r.get('edition'),str(edition) if edition is not None else 'unspecified')
        suffix='-'+_identity(version) if version!='unspecified' else ''
        p=dict(id='pes-'+card_pid+suffix,identity=identity,name=str(r['name']),full_name=_text(r.get('full_name',r['name'])),dob=dob,provider_player_id=pid,identity_resolution=resolution,positions=[posmap.get(x.strip(),x.strip()) for x in re.split(r'[,/]',r.position)],overall=_number(r.overall),nation=nation,club=_text(r.get('team'),'Unknown'),league='Imported PES',era=era,season=_text(r.get('season'),'PES user import'),edition=version,source='user-pes-csv',lineage='pes-group-proxy',source_date=_text(r.get('source_date'),'unspecified'),era_basis='user-specified era')
        _attributes(p,r,groups)
        _provenance(p,path,source_metadata,r,source_hash)
        rows.append(p)
    return validate_players(rows)

def identity_review_candidates(left,right):
    """Suggest exact full-name/DOB/nation matches for review without merging."""
    matches=[]
    for a in left:
        fields=(_text(a.get('full_name')),_dob(a.get('dob')),_text(a.get('nation')))
        if not all(fields) or fields[2] in ('Unknown','nan'):continue
        candidates=[]
        for b in right:
            other=(_text(b.get('full_name')),_dob(b.get('dob')),_text(b.get('nation')))
            if all(other) and _identity(fields[0])==_identity(other[0]) and fields[1]==other[1] and _identity(fields[2])==_identity(other[2]):
                candidates.append(b)
        for b in candidates:
            matches.append(dict(left_id=a['id'],right_id=b['id'],requires_review=True,
                                ambiguous=len(candidates)>1,basis='Exact normalized full name, birth date and nationality'))
    return matches

def pool_report(players,config=None,source_manifest=None):
    """Report schema, identities, missingness and the engine's era feasibility."""
    validate_players(players)
    from .engine import era_eligibility
    if source_manifest is None:
        path=ROOT/'data'/'manifest.json'
        source_manifest=json.loads(path.read_text(encoding='utf-8')) if path.is_file() else {}
    sources={}
    for p in players:
        source=sources.setdefault(p['source'],dict(cards=0,licenses=[]))
        source['cards']+=1
        license=p.get('license') or source_manifest.get('sources',{}).get(p['source'],{}).get('declared_license') or 'unspecified'
        if license not in source['licenses']:source['licenses'].append(deepcopy(license))
    return dict(cards=len(players),people=len({p['identity'] for p in players}),
                positions={pos:len({p['identity'] for p in players if pos in p['positions']}) for pos in sorted(POSITIONS)},
                missing_attributes={key:sum(p.get(key) is None for p in players) for key in OUTFIELD+KEEPER+('stamina','vision','finishing')},
                sources=sources,eras=era_eligibility(players,config),
                identity_note='Provider identities and reviewed overrides are retained; similar names are never merged automatically.',
                coverage_note='Engine matching checks starter and GK/defence/midfield/attack reserve coverage. Alternative editions of one person are grouped; this report does not certify salary/tier constraints or every randomized edition draw.')
