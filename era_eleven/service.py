"""One persistent game authority for browser routes and editable notebooks."""
from copy import deepcopy
from collections import OrderedDict
from dataclasses import asdict
from datetime import datetime, timezone, timedelta
import hashlib
import json
import secrets
from threading import RLock
from .data import ROOT, load_players
from .engine import Config, DraftGame, ERAS, choose_era, era_eligibility, swap_player, rate_team, simulate_match, simulate_series, simulate_season, card_tier, card_cost, assign_lineup
from .modes import RULES_VERSION, stable_seed, generated_team, campaign_progress, advance_campaign
from .persistence import Store
from .render import card_html, team_html, result_html

SETTINGS=dict(era_fx=True,reduce_motion=False,sound=False,theme='stadium',speed='normal',auto_subs=True)
ACHIEVEMENTS=[('first-draft','First fifteen','Complete a five-spin draft'),('first-win','First victory','Win a recorded match'),('collector','The collector','Collect fifty distinct cards'),('era-tour','Era traveller','Complete drafts in five different pools'),('gauntlet','Through the ages','Complete the Era Gauntlet'),('league','Full season','Complete fourteen League rounds'),('two-humans','Derby day','Finish a match against another human')]


def integer(value, name='Seed', maximum=2**63-1):
    if isinstance(value,bool) or not isinstance(value,int) or not 0<=value<=maximum:
        raise ValueError(f'{name} must be an integer from 0 to {maximum}.')
    return value


class GameService:
    def __init__(self, players=None, state_path=None, today=None):
        self.players=players or load_players()
        self.store=Store(state_path or ROOT/'data'/'local'/'game.sqlite')
        self.lock=RLock();self.today=today;self.draft_cache=OrderedDict()
        raw=json.dumps(self.players,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
        self.data_hash=hashlib.sha256(raw).hexdigest()
        from .analytics import backend_status
        self.backend=backend_status()
        fingerprint=hashlib.sha256(json.dumps(dict(data=self.data_hash,rules=RULES_VERSION,model=self.backend['model_version'],pin=self.backend['dependency_pin'],backend=self.backend['backend'],verified=self.backend['scoring_module_matches_audit']),sort_keys=True).encode()).hexdigest()[:20]
        self.version=f'{RULES_VERSION}:{fingerprint}'
        self.eligibility=era_eligibility(self.players)

    def call(self, path, body=None):
        body=body or {}
        if not isinstance(body,dict):raise ValueError('Send a JSON object.')
        with self.lock,self.store.connection:
            return deepcopy(self._call(path,body))

    def _profile(self, credential=None, create=False):
        if credential:return self.store.get('profile',credential)
        if not create:raise ValueError('A profile credential is required.')
        credential=secrets.token_urlsafe(24)
        p=dict(profile=credential,display_name='Player '+credential[:4],settings=dict(SETTINGS),stats=dict(runs=0,wins=0,draws=0,losses=0,goals_for=0,goals_against=0,drafts=0),collection=[],eras=[],earned=[],recorded=[])
        self.store.put('profile',credential,p);return p

    def _progress(self, p):
        ids=set(p['collection']);cards=[dict(id=x['id'],name=x['name'],era=x['era'],overall=x['overall'],positions=x['positions'],lineage=x['lineage']) for x in self.players if x['id'] in ids]
        return dict(profile=p['profile'],display_name=p['display_name'],settings=p['settings'],stats=p['stats'],collection=cards,
                    achievements=[dict(id=i,name=n,description=d,earned=i in p['earned']) for i,n,d in ACHIEVEMENTS],leaderboard=self.leaderboard(),scope='This server only; profile credentials are stored in this browser. Export them to move devices.')

    def leaderboard(self, mode=None, week=None):
        rows=[r for r in self.store.all('score') if (mode is None or r['mode']==mode) and (week is None or r.get('week')==week) and r['version']==self.version]
        return sorted(rows,key=lambda r:(r['mode'],-r['score'],r['display_name']))[:100]

    def _collect(self, profile, game):
        p=self._profile(profile)
        p['collection']=sorted(set(p['collection'])|{x['id'] for x in game.squad})
        if len(p['collection'])>=50 and 'collector' not in p['earned']:p['earned'].append('collector')
        self.store.put('profile',profile,p)

    def _award(self, run, result, key=None, mode=None, profile=None):
        credential=profile or run['profile'];p=self._profile(credential)
        record=key or run['token']
        if record in p['recorded']:return
        p['recorded'].append(record);stats=p['stats'];stats['runs']+=1
        h,a=result['home_goals'],result['away_goals'];outcome='wins' if h>a else 'draws' if h==a else 'losses'
        stats[outcome]+=1;stats['goals_for']+=h;stats['goals_against']+=a
        if h>a and 'first-win' not in p['earned']:p['earned'].append('first-win')
        earned={'gauntlet':'gauntlet','league':'league','head-to-head':'two-humans'}.get(mode or run['mode'])
        if earned and earned not in p['earned'] and ((mode or run['mode'])!='gauntlet' or run['campaign'].get('status')=='champion'):p['earned'].append(earned)
        score=run.get('score',3 if h>a else 1 if h==a else 0)
        score_key=f'{credential}:{mode or run["mode"]}:{run.get("week","")}'
        candidate=dict(display_name=p['display_name'],mode=mode or run['mode'],score=score,week=run.get('week'),version=self.version,era=run['era'])
        try:previous=self.store.get('score',score_key)
        except ValueError:previous=None
        if previous is None or previous['version']!=self.version or score>previous['score']:self.store.put('score',score_key,candidate)
        self.store.put('profile',credential,p)

    def _game(self, run):
        if run['version']!=self.version:raise ValueError('This run uses a different data, model or rules version. Use its original release or start a new run.')
        key=json.dumps([run['era'],run['seed'],run['config'],run.get('draft_rules',{})],sort_keys=True)
        if key not in self.draft_cache:
            self.draft_cache[key]=DraftGame(self.players,era=run['era'],seed=run['seed'],config=Config(**run['config']),**run.get('draft_rules',{}))
            if len(self.draft_cache)>64:self.draft_cache.popitem(last=False)
        g=deepcopy(self.draft_cache[key])
        for _ in range(run['spins']):g.spin()
        for old,new in run.get('transfers',[]):
            target=next((i for i,p in enumerate(g.squad) if p['id']==old),None)
            if target is None:raise ValueError('Transfer no longer belongs to this squad.')
            g.squad[target]=deepcopy(next(p for p in self.players if p['id']==new))
        team=g.lineup(run.get('formation')) if g.complete else None
        if team:
            for slot,bench_id in run.get('swaps',[]):team=swap_player(team,slot,bench_id)
        return g,team

    def _state(self, run):
        g,t=self._game(run)
        progress=campaign_progress(run)
        if run['mode']=='gauntlet' and progress.get('needs_management'):
            people={p['identity'] for p in g.squad}
            progress['free_agents']=[dict(id=p['id'],name=p['name'],positions=p['positions'],tier=card_tier(p),cost={'S':3,'A':2,'B':1}[card_tier(p)]) for p in self.players if p['identity'] not in people and (progress['era']=='Legends' and 'reconstruction' in p['lineage'] or p['era']==progress['era'])][:120]
        return dict(token=run['token'],profile=run['profile'],seed=g.seed,era=g.era,requested_era=run['requested_era'],mode=run['mode'],variant=run.get('variant','original'),respin_used=run.get('respin_used',False),salary=dict(cap=g.config.salary_cap,spent=sum(card_cost(p) for p in g.squad),tiers={tier:sum(card_tier(p)==tier for p in g.squad) for tier in ['S','A','B']}),version=run['version'],config=run['config'],manager=g.manager,formation=t['formation'] if t else g.formation,formations=g.manager['formations'],count=len(g.squad),spins=len(g.batches),complete=g.complete,
                    cards=[card_html(p) for p in (g.batches[-1] if g.batches else [])],team_html=team_html(t) if t else '',
                    squad=[dict(id=p['id'],identity=p['identity'],name=p['name'],overall=p['overall'],positions=p['positions'],era=p['era']) for p in g.squad],
                    starters=[dict(index=i,name=s['player']['name'],slot=s['slot']) for i,s in enumerate(t['starters'])] if t else [],
                    bench=[dict(id=p['id'],name=p['name'],positions=p['positions']) for p in t['bench']] if t else [],
                    analytics=dict(rating=rate_team(t),backend=self.backend) if t else dict(backend=self.backend),progress=progress,result=run.get('result'),revision=run.get('revision',0))

    def weekly(self):
        day=self.today or datetime.now(timezone.utc).date(); monday=day-timedelta(days=day.weekday())
        week=monday.isoformat(); seed=stable_seed(f'{self.version}:weekly:{week}')
        era=choose_era(self.players,seed)
        return dict(week=week,seed=seed,era=era,config=asdict(Config()),version=self.version,matches=10,starts_utc=week,ends_utc=(monday+timedelta(days=7)).isoformat(),label='Same ten generated rivals, seed, data and settings for every player. Highest season points wins; no global ranking service.')

    def _new(self, body):
        p=self._profile(body.get('profile'),create=True)
        mode=body.get('mode','solo')
        if mode not in ['solo','gauntlet','league','weekly','circuit']:raise ValueError('Unsupported game mode.')
        options=dict(body.get('config',{}))
        if body.get('variant')=='salary-cap':options['salary_cap']=body.get('salary_cap',200)
        cfg=Config(**options);seed=integer(body.get('seed',42));requested=body.get('era','All eras')
        era=choose_era(self.players,seed,body.get('random_era_weights'),cfg) if requested=='Randomize Era' else requested
        extra={}
        if mode=='circuit':
            total=integer(body.get('tournaments',15),'Tournaments',20)
            if total<10:raise ValueError('A circuit contains ten to twenty tournaments.')
            extra['tournaments']=total
        if mode=='weekly':
            challenge=self.weekly();seed=challenge['seed'];era=challenge['era'];cfg=Config();requested=era;extra['week']=challenge['week']
        rules={}
        if body.get('variant')=='salary-cap':rules={'tier_quotas':{'S':2,'A':4,'B':9}}
        if mode=='gauntlet':
            rules={'tier_limits':{'S':1,'A':4} if body.get('roster_cap',True) else {'S':1},'pool_eras':['Classics','1990s','2000s']};era='Legends'
            from .modes import GAUNTLET_MAPS
            if body.get('gauntlet_map','three') not in GAUNTLET_MAPS:raise ValueError('Unsupported Gauntlet map.')
        g=DraftGame(self.players,era=era,seed=seed,config=cfg,**rules)
        token=secrets.token_urlsafe(24)
        run=dict(token=token,profile=p['profile'],mode=mode,era=era,requested_era=requested,seed=seed,config=asdict(cfg),spins=0,swaps=[],version=self.version,revision=0,actions={},campaign={},draft_rules=rules,variant=body.get('variant','original'),respin_used=False,gauntlet_map=body.get('gauntlet_map','three'),roster_cap=body.get('roster_cap',True),**extra)
        self.draft_cache[json.dumps([era,seed,run['config'],rules],sort_keys=True)]=deepcopy(g)
        self.store.put('run',token,run)
        return self._state(run)

    def _dedup(self, value, body, path):
        action=body.get('action_id')
        if action is not None:
            if not isinstance(action,str) or not 1<=len(action)<=100:raise ValueError('Invalid action identifier.')
            digest=hashlib.sha256(json.dumps(dict(body,path=path),sort_keys=True).encode()).hexdigest()
            prior=value.setdefault('actions',{}).get(action)
            if prior:
                if prior['digest']!=digest:raise ValueError('Action identifier was reused with different data.')
                return prior['response'],digest
            return None,digest
        return None,None

    def _save_action(self, kind, value, body, digest, response):
        action=body.get('action_id')
        if action:value.setdefault('actions',{})[action]=dict(digest=digest,response=response)
        self.store.put(kind,value['token'] if kind=='run' else value['room'],value)
        return response

    def _call(self, path, body):
        if path=='meta':return dict(eras=ERAS,players=len(self.players),eligibility=self.eligibility,version=self.version,analytics=self.backend,weekly=self.weekly(),modes=['solo','gauntlet','weekly','league','circuit','head-to-head'],mini_games=['daily_card','higher_lower','roster_roulette','country_hunt'],scope='Rankings and rooms are shared by clients connected to this server only.')
        if path in ['profile','progress']:
            return self._progress(self._profile(body.get('profile'),create=path=='profile'))
        if path=='leaderboard':return dict(rows=self.leaderboard(body.get('mode'),body.get('week')),scope='This server only')
        if path=='settings':
            p=self._profile(body.get('profile'));changes=body.get('settings',{})
            if not isinstance(changes,dict) or set(changes)-set(SETTINGS):raise ValueError('Unknown settings.')
            for key,value in changes.items():
                if key in ['theme','speed']:
                    if value not in (['stadium','night'] if key=='theme' else ['instant','normal']):raise ValueError('Unsupported setting value.')
                elif not isinstance(value,bool):raise ValueError('Switch settings must be true or false.')
            p['settings'].update(changes)
            if 'display_name' in body:
                name=body['display_name']
                if not isinstance(name,str) or not 1<=len(name.strip())<=30:raise ValueError('Display names need 1 to 30 characters.')
                p['display_name']=name.strip()
            self.store.put('profile',p['profile'],p);return self._progress(p)
        if path=='new':return self._new(body)
        if path.startswith('room/'):
            from .rooms import room_call
            return room_call(self,path,body)
        if path.startswith('mini/'):
            from .mini import mini_call
            return mini_call(self,path,body)
        if path.startswith('league/'):
            from .career import career_call
            return career_call(self,path,body)
        if path=='import':
            payload=body.get('payload')
            if not isinstance(payload,dict) or payload.get('version')!=self.version:raise ValueError('Import needs a matching versioned Era Eleven run.')
            # Imported runs are unranked replays. Scores and arbitrary roster attributes are never trusted.
            for key in ['result','score','team','squad','campaign']:
                if key in payload:raise ValueError('Import a replay recipe, without client-supplied teams or results.')
            cfg=Config(**payload['config']);g=DraftGame(self.players,payload['era'],integer(payload['seed']),cfg,**payload.get('draft_rules',{}))
            spins=integer(payload['spins'],'Spins',5)
            for _ in range(spins):g.spin()
            if payload.get('awards')!=[p['id'] for p in g.squad]:raise ValueError('Imported awards do not match the authoritative seeded draft.')
            response=self._new(dict(profile=body.get('profile'),mode='solo',era=payload['era'],seed=payload['seed'],config=payload['config']))
            run=self.store.get('run',response['token']);run.update(spins=spins,swaps=payload.get('swaps',[]),formation=payload.get('formation'),requested_era=payload.get('requested_era',payload['era']),draft_rules=payload.get('draft_rules',{}),transfers=payload.get('transfers',[]),unranked=True)
            state=self._state(run);self.store.put('run',run['token'],run);return state
        run=self.store.get('run',body.get('token'));g,team=self._game(run)
        if path=='state':return self._state(run)
        if path=='export':
            original=DraftGame(self.players,run['era'],run['seed'],Config(**run['config']),**run.get('draft_rules',{}))
            for _ in range(run['spins']):original.spin()
            return dict(version=self.version,mode=run['mode'],era=run['era'],requested_era=run['requested_era'],seed=run['seed'],config=run['config'],spins=run['spins'],formation=run.get('formation'),swaps=run['swaps'],draft_rules=run.get('draft_rules',{}),transfers=run.get('transfers',[]),awards=[p['id'] for p in original.squad],label='Replay recipe; results are recomputed by the server. Campaigns import as unranked practice.')
        prior,digest=self._dedup(run,body,path)
        if prior is not None:return prior
        if 'revision' in body and body['revision']!=run['revision']:raise ValueError('State changed. Refresh before repeating this action.')
        if path=='respin':
            if run['mode']!='solo' or run.get('respin_used') or run.get('result'):raise ValueError('One entire-draft respin is available in solo practice before play.')
            run.update(seed=run['seed']+1000000,spins=0,swaps=[],respin_used=True,unranked=True)
            run.pop('formation',None);run['revision']+=1
            return self._save_action('run',run,body,digest,self._state(run))
        if path=='spin':
            g.spin();run['spins']+=1;self._collect(run['profile'],g)
            if g.complete:
                p=self._profile(run['profile']);p['stats']['drafts']+=1
                p['eras']=sorted(set(p['eras'])|{g.era})
                if 'first-draft' not in p['earned']:p['earned'].append('first-draft')
                if len(p['eras'])>=5 and 'era-tour' not in p['earned']:p['earned'].append('era-tour')
                self.store.put('profile',p['profile'],p)
            run['revision']+=1
            return self._save_action('run',run,body,digest,self._state(run))
        if not g.complete:raise ValueError('Complete five spins first.')
        if path=='manage':
            c=run['campaign']
            if run['mode']!='gauntlet' or not c.get('needs_management') or c.get('complete'):raise ValueError('Management is available once between Gauntlet segments.')
            action=body.get('action');cost=0
            if action=='rest':
                streak=c.get('rest_streak',0);c['patience']=min(20,c.get('patience',8)+max(0,2-streak));c['rest_streak']=streak+1
            elif action in ['develop','best-era']:
                cost=1;field='badges' if action=='develop' else 'era_upgrades';c[field]=c.get(field,0)+1
            elif action=='freeagency':
                outgoing=next((p for p in team['bench'] if p['id']==body.get('bench_id')),None)
                incoming=next((p for p in self.players if p['id']==body.get('free_agent_id')),None)
                eligible={p['id'] for p in self._state(run)['progress']['free_agents']}
                if outgoing is None or incoming is None or incoming['id'] not in eligible:raise ValueError('Choose an offered free agent and an existing substitute.')
                squad=[deepcopy(incoming) if p['id']==outgoing['id'] else p for p in g.squad]
                if run.get('roster_cap',True) and (sum(card_tier(p)=='S' for p in squad)>2 or sum(card_tier(p)=='A' for p in squad)>4):raise ValueError('Active signings must respect the 2 S / 4 A roster cap.')
                assign_lineup(squad,team['formation'],g.manager,g.config)
                if not any('GK' in p['positions'] for p in squad if p['id']!=team['starters'][0]['player']['id']):raise ValueError('Keep the reserve goalkeeper.')
                cost={'S':3,'A':2,'B':1}[card_tier(incoming)]
                run.setdefault('transfers',[]).append([outgoing['id'],incoming['id']]);run['swaps']=[]
            else:raise ValueError('Choose a listed management action.')
            if cost:
                if c.get('patience',8)<=cost:raise ValueError('Keep at least one Owner Patience after spending.')
                c['patience']-=cost;c['rest_streak']=0
            c['needs_management']=False;run['revision']+=1
            return self._save_action('run',run,body,digest,self._state(run))
        if path in ['swap','formation']:
            if run.get('result') or run['campaign']:raise ValueError('This lineup is locked after play begins. Start a new run to change it.')
            if path=='swap':
                team=swap_player(team,body.get('slot'),body.get('bench_id'));run['swaps'].append([body['slot'],body['bench_id']])
            else:
                g.lineup(body.get('formation'));run['formation']=body.get('formation');run['swaps']=[]
            run['revision']+=1
            return self._save_action('run',run,body,digest,self._state(run))
        rival=generated_team(self.players,g.era,g.seed+100000,g.config)
        if path=='series':return simulate_series(team,rival,n=body.get('n',2000),seed=integer(body.get('seed',2026)))
        if path=='season':return simulate_season(team,[generated_team(self.players,g.era,g.seed+200000+i,g.config) for i in range(38)],seed=integer(body.get('seed',2026)))
        if path=='match':
            if run['mode'] in ['league','gauntlet','circuit']:raise ValueError('Advance this campaign through its scheduled fixtures.')
            if run.get('result'):return dict(result=run['result'],html=result_html(run['result']),opponent=run['result'].get('opponent','Seeded rival'),progress=campaign_progress(run))
            if run['mode']=='weekly':
                season=simulate_season(team,[generated_team(self.players,g.era,stable_seed(f'{self.version}:{run["week"]}:rival:{i}'),Config()) for i in range(10)],seed=stable_seed(f'{self.version}:{run["week"]}:matches'))
                result=simulate_match(team,rival,seed=stable_seed(f'{self.version}:{run["week"]}:showcase'),home_advantage=0)
                result['challenge']=season;run['score']=season['points']
            else:result=simulate_match(team,rival,seed=integer(body.get('seed',2026)))
            result['opponent']='Seeded generated rival';run['result']=result;run['revision']+=1
            if not run.get('unranked'):self._award(run,result)
            return self._save_action('run',run,body,digest,dict(result=result,html=result_html(result),opponent=result['opponent'],progress=campaign_progress(run)))
        if path=='advance':
            if run['mode']=='circuit':
                from .circuit import advance
                result=advance(run,team,self.players)
            else:result=advance_campaign(run,team,self.players)
            run['result']=result;run['revision']+=1
            progress=campaign_progress(run)
            if progress['complete'] and not run.get('unranked'):self._award(run,result)
            response=dict(state=self._state(run),result=result,html=result_html(result),progress=progress)
            return self._save_action('run',run,body,digest,response)
        raise ValueError('Unknown action.')
