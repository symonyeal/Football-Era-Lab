"""Interactive Jupyter controls for the same engine used by the local game."""
from pathlib import Path
import json
from copy import deepcopy
from dataclasses import asdict
from html import escape
from uuid import uuid4
import ipywidgets as w
from IPython.display import HTML, display
from .engine import Config, DraftGame, ERAS, simulate_match, simulate_series, swap_player
from .render import card_html, team_html, result_html, wrap

class NotebookGame:
    def __init__(self,players,config=None,seed=42,era='All eras'):
        self.players=players;self.config=config or Config();self.game=None;self.team=None;self.opponent=None;self.result=None
        self.era=w.Dropdown(options=ERAS,value=era,description='Player era:')
        self.seed=w.BoundedIntText(value=seed,min=0,max=2**31-1,description='Draft seed:')
        self.chemistry=w.FloatSlider(value=self.config.chemistry_weight,min=0,max=8,step=.25,description='Chemistry:')
        self.tactics=w.FloatSlider(value=self.config.tactical_weight,min=0,max=8,step=.25,description='Tactics:')
        self.auto_subs=w.Checkbox(value=self.config.auto_subs,description='Automatic substitutes')
        self.new_button=w.Button(description='Draw manager + formation',button_style='warning',layout=w.Layout(width='240px'))
        self.spin_button=w.Button(description='SPIN · 3 players',button_style='success')
        self.fill_button=w.Button(description='Finish all five spins')
        self.match_seed=w.BoundedIntText(value=2026,min=0,max=2**31-1,description='Match seed:')
        self.play_button=w.Button(description='Play match',button_style='warning',disabled=True)
        self.trials=w.IntSlider(value=2000,min=100,max=10000,step=100,description='Trials:')
        self.series_button=w.Button(description='Run repeated matches',disabled=True,layout=w.Layout(width='210px'))
        self.slot=w.Dropdown(options=[],description='Take off:')
        self.sub=w.Dropdown(options=[],description='Bring on:')
        self.swap_button=w.Button(description='Swap substitute',disabled=True)
        self.status=w.HTML();self.board=w.HTML();self.batch=w.HTML();self.score=w.HTML()
        self.new_button.on_click(lambda _:self._safe(self.start))
        self.spin_button.on_click(lambda _:self._safe(self.spin))
        self.fill_button.on_click(lambda _:self._safe(self.finish))
        self.play_button.on_click(lambda _:self._safe(self.play))
        self.series_button.on_click(lambda _:self._safe(self.repeated))
        self.swap_button.on_click(lambda _:self._safe(self.swap))
        tuning=w.Accordion(children=[w.VBox([self.chemistry,self.tactics,self.auto_subs])]);tuning.set_title(0,'Tweak game settings (apply to a new draft)');tuning.selected_index=None
        self.ui=w.VBox([w.HTML(wrap('<div class="caps small muted">Football draft laboratory</div><h1>ERA ELEVEN</h1><p>Five spins. Fifteen players. One starting eleven.</p>')),w.HBox([self.era,self.seed]),tuning,self.new_button,self.status,w.HBox([self.spin_button,self.fill_button]),self.batch,self.board,w.HBox([self.slot,self.sub,self.swap_button]),w.HBox([self.match_seed,self.play_button]),w.HBox([self.trials,self.series_button]),self.score])
        self.start()

    def _safe(self,fn):
        try:fn()
        except (ValueError,TypeError,KeyError) as exc:
            from html import escape
            self.status.value=wrap('<p style="color:#f9ac8c">'+escape(str(exc))+'</p>')

    def start(self):
        from dataclasses import replace
        cfg=replace(self.config,chemistry_weight=self.chemistry.value,tactical_weight=self.tactics.value,auto_subs=self.auto_subs.value)
        game=DraftGame(self.players,era=self.era.value,seed=self.seed.value,config=cfg)
        self.game=game;self.team=None;self.opponent=None;self.result=None
        self.batch.value='';self.board.value='';self.score.value=''
        self.slot.options=[];self.sub.options=[]
        self.spin_button.disabled=False;self.fill_button.disabled=False
        self.play_button.disabled=True;self.series_button.disabled=True;self.swap_button.disabled=True
        self._status()

    def _status(self):
        from html import escape
        g=self.game
        self.status.value=wrap(f'<div class="caps small muted">{escape(g.era)} · seed {g.seed} · spin {len(g.batches)} / 5</div><h2>{escape(g.manager["name"])} · {g.formation}</h2><p class="muted">{escape(g.manager["style"])} · {len(g.squad)} / 15 players</p>')

    def spin(self):
        batch=self.game.spin()
        self.batch.value=wrap('<div class="cards">'+''.join(card_html(p) for p in batch)+'</div>')
        self._status()
        if self.game.complete:
            self.team=self.game.lineup()
            rival=DraftGame(self.players,era=self.game.era,seed=self.game.seed+100000,config=self.game.config)
            for _ in range(5):rival.spin()
            self.opponent=rival.lineup()
            self.spin_button.disabled=True;self.fill_button.disabled=True
            self.play_button.disabled=False;self.series_button.disabled=False;self.swap_button.disabled=False
            self._team()
        return batch

    def _team(self):
        self.board.value=wrap(team_html(self.team))
        self.slot.options=[(f'{s["slot"]}: {s["player"]["name"]}',i) for i,s in enumerate(self.team['starters'])]
        self.sub.options=[(p['name']+' / '+', '.join(p['positions']),p['id']) for p in self.team['bench']]

    def finish(self):
        while not self.game.complete:self.spin()

    def swap(self):
        self.team=swap_player(self.team,int(self.slot.value),self.sub.value)
        self.result=None;self.score.value='';self._team()

    def play(self):
        self.result=simulate_match(self.team,self.opponent,seed=self.match_seed.value)
        self.score.value=wrap('<div class="caps small muted">Your XI vs a seeded rival XI</div>'+result_html(self.result))
        return self.result

    def repeated(self):
        self.result=simulate_series(self.team,self.opponent,n=self.trials.value,seed=self.match_seed.value)
        rows=''.join(f'<div class="metric"><span>{key.title()}</span><b>{p:.1%} · sampling interval {self.result["sampling_intervals"][key][0]:.1%} to {self.result["sampling_intervals"][key][1]:.1%}</b></div>' for key,p in self.result['probabilities'].items())
        self.score.value=wrap(f'<h2>{self.trials.value:,} matches</h2>{rows}<p class="small muted">{self.result["interval_note"]}</p>')
        return self.result

    def save(self,path):
        path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
        payload=dict(seed=self.game.seed,era=self.game.era,manager=self.game.manager,squad=self.game.squad,team=self.team,result=self.result)
        path.write_text(json.dumps(payload,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
        return path

    def display(self):display(self.ui);return self


class NotebookModes:
    """Drive saved game modes through GameService, with private local credentials.

    The default service is in memory. Set state_path to a persistent project
    database to resume this notebook's private session after a kernel restart.
    Public states and rendered widgets omit credentials and mutation tokens.
    """
    def __init__(self, service=None, players=None, state_path=None, config=None, seed=42):
        from .service import GameService
        from .modes import GAUNTLET_MAPS
        self._owns_service = service is None
        self._service = service or GameService(players=players, state_path=state_path or ':memory:')
        self._run_token = None
        self._career_token = None
        self._room_code = None
        self._room_credentials = []
        self._run_state = None
        self._career_state = None
        self._room_state = None
        self.state = None
        self.career_state = None
        self.room_state = None
        self._meta = self._service.call('meta')
        try:
            saved = self._service.store.get('notebook_session', 'NotebookModes')
            self._profile_credential = saved['profile']
            self._service.call('progress', {'profile': self._profile_credential})
        except (ValueError, KeyError):
            saved = {}
            self._profile_credential = self._service.call('profile')['profile']
        cfg = config if isinstance(config, Config) else Config(**(config or {}))
        self.mode = w.Dropdown(options=[('Solo practice', 'solo'), ('Weekly challenge', 'weekly'),
                                       ('Era Gauntlet', 'gauntlet'), ('Tournament circuit', 'circuit'),
                                       ('League schedule laboratory', 'league')], description='Mode:')
        self.era = w.Dropdown(options=[*ERAS, 'Randomize Era'], value='All eras', description='Draft era:')
        self.seed = w.BoundedIntText(value=seed, min=0, max=2**31-1, description='Run seed:')
        self.config_editor = w.Textarea(value=json.dumps(asdict(cfg), indent=2), description='Model JSON:',
                                        layout=w.Layout(width='100%', height='240px'))
        self.circuit_length = w.BoundedIntText(value=15, min=10, max=20, description='Events:')
        self.gauntlet_map = w.Dropdown(options=list(GAUNTLET_MAPS), value='three', description='Era map:')
        self.variant = w.Dropdown(options=[('Original', 'original'), ('Salary cap', 'salary-cap')], description='Draft:')
        self.new_button = w.Button(description='Begin new competition', button_style='warning', layout=w.Layout(width='220px'))
        self.spin_button = w.Button(description='Spin: three players', button_style='success', disabled=True)
        self.fill_button = w.Button(description='Finish five spins', disabled=True)
        self.formation = w.Dropdown(options=[], description='Formation:')
        self.formation_button = w.Button(description='Apply formation', disabled=True)
        self.slot = w.Dropdown(options=[], description='Take off:')
        self.sub = w.Dropdown(options=[], description='Bring on:')
        self.swap_button = w.Button(description='Swap substitute', disabled=True)
        self.match_seed = w.BoundedIntText(value=2026, min=0, max=2**31-1, description='Match seed:')
        self.trials = w.BoundedIntText(value=500, min=100, max=10000, description='Trials:')
        self.play_button = w.Button(description='Play match / challenge', button_style='warning', disabled=True,
                                    layout=w.Layout(width='210px'))
        self.series_button = w.Button(description='Repeated matches', disabled=True)
        self.advance_button = w.Button(description='Next scheduled event', button_style='info', disabled=True)
        self.manage_choice = w.Dropdown(options=[], description='Management:')
        self.free_agent_out = w.Dropdown(options=[], description='Replace:')
        self.free_agent_in = w.Dropdown(options=[], description='Free agent:')
        self.manage_button = w.Button(description='Confirm management', disabled=True)
        self.status = w.HTML(value=wrap('<p>Create a competition, then complete five spins.</p>'))
        self.batch = w.HTML()
        self.board = w.HTML()
        self.progress = w.HTML()
        self.score = w.HTML()
        self.new_button.on_click(lambda _: self._safe(self.start))
        self.spin_button.on_click(lambda _: self._safe(self.spin))
        self.fill_button.on_click(lambda _: self._safe(self.finish))
        self.formation_button.on_click(lambda _: self._safe(self.set_formation))
        self.swap_button.on_click(lambda _: self._safe(self.swap))
        self.play_button.on_click(lambda _: self._safe(self.play))
        self.series_button.on_click(lambda _: self._safe(self.repeated))
        self.advance_button.on_click(lambda _: self._safe(self.advance))
        self.manage_button.on_click(lambda _: self._safe(self.manage))
        tuning = w.Accordion(children=[w.VBox([w.HTML('<p>JSON settings apply to new draft competitions. Weekly challenges and rooms use their own fixed rules. Applied values appear below the draft.</p>'), self.config_editor])])
        tuning.set_title(0, 'Edit football simulation settings')
        tuning.selected_index = None
        draft_ui = w.VBox([w.HBox([self.mode, self.era, self.seed]), w.HBox([self.variant, self.circuit_length, self.gauntlet_map]),
                           tuning, self.new_button, self.status, w.HBox([self.spin_button, self.fill_button]), self.batch,
                           self.board, w.HBox([self.formation, self.formation_button]),
                           w.HBox([self.slot, self.sub, self.swap_button]), w.HBox([self.match_seed, self.play_button]),
                           w.HBox([self.trials, self.series_button, self.advance_button]),
                           w.HBox([self.manage_choice, self.manage_button]), w.HBox([self.free_agent_out, self.free_agent_in]),
                           self.progress, self.score])
        self._build_career()
        self._build_local_room()
        tabs = w.Tab(children=[draft_ui, self.career_ui, self.room_ui])
        for i, title in enumerate(('Draft competitions', 'Player career', 'Two local humans')):
            tabs.set_title(i, title)
        self.ui = w.VBox([w.HTML(wrap('<div class="caps small muted">Shared game authority · editable notebook controls</div><h1>ERA ELEVEN</h1><p>Draft competitions, a four-decision football career, and two-human local rooms.</p>')), tabs])
        self._restore(saved)
        self._save_session()

    @staticmethod
    def _public(value):
        if isinstance(value, dict):
            return {key: NotebookModes._public(item) for key, item in value.items()
                    if key not in ('profile', 'token', 'career_token', 'credential', 'local_credentials', 'actions')}
        if isinstance(value, list):
            return [NotebookModes._public(item) for item in value]
        return deepcopy(value)

    def _save_session(self):
        # Only private session metadata uses Store directly. Every draft,
        # simulation, progression and room action goes through GameService.call.
        value = dict(profile=self._profile_credential, run_token=self._run_token,
                     career_token=self._career_token, room=self._room_code,
                     room_credentials=self._room_credentials)
        with self._service.lock, self._service.store.connection:
            self._service.store.put('notebook_session', 'NotebookModes', value)

    def _restore(self, saved):
        self._run_token = saved.get('run_token')
        self._career_token = saved.get('career_token')
        self._room_code = saved.get('room')
        self._room_credentials = saved.get('room_credentials', [])
        if self._run_token:
            self._safe(lambda: self._render_run(self._service.call('state', {'token': self._run_token})))
        if self._career_token:
            self._safe(lambda: self._render_career(self._service.call('league/state',
                {'profile': self._profile_credential, 'career_token': self._career_token})))
        if self._room_code and self._room_credentials:
            self._safe(self.local_refresh)

    def _safe(self, action):
        try:
            return action()
        except (ValueError, TypeError, KeyError) as exc:
            self.status.value = wrap('<p style="color:#f9ac8c">' + escape(str(exc)) + '</p>')
            return None

    @staticmethod
    def _table(rows, columns):
        if not rows:
            return '<p class="muted">No records yet.</p>'
        header = ''.join('<th>' + escape(c.replace('_', ' ').title()) + '</th>' for c in columns)
        body = ''.join('<tr>' + ''.join('<td>' + escape(str(row.get(c, ''))) + '</td>' for c in columns) + '</tr>' for row in rows)
        return '<table><thead><tr>' + header + '</tr></thead><tbody>' + body + '</tbody></table>'

    def _run_call(self, path, **body):
        if not self._run_token:
            raise ValueError('Begin a competition first.')
        request = dict(token=self._run_token, **body)
        if path not in ('state', 'series'):
            request['action_id'] = uuid4().hex
        response = self._service.call(path, request)
        raw = response.get('state') if isinstance(response, dict) else None
        if raw is None:
            raw = response if path in ('spin', 'manage', 'formation', 'swap') else self._service.call('state', {'token': self._run_token})
        self._render_run(raw)
        self._save_session()
        return self._public(response)

    def start(self, mode=None):
        if mode is not None:
            self.mode.value = mode
        try:
            config = json.loads(self.config_editor.value)
        except json.JSONDecodeError as exc:
            raise ValueError('Model settings must be a JSON object.') from exc
        if not isinstance(config, dict):
            raise ValueError('Model settings must be a JSON object.')
        response = self._service.call('new', dict(profile=self._profile_credential, mode=self.mode.value,
            era=self.era.value, seed=self.seed.value, config=config, variant=self.variant.value,
            salary_cap=config.get('salary_cap') if config.get('salary_cap') is not None else 200,
            tournaments=self.circuit_length.value, gauntlet_map=self.gauntlet_map.value))
        self._run_token = response['token']
        self.score.value = ''
        self._render_run(response)
        self._save_session()
        return self.state

    def spin(self):
        return self._run_call('spin')

    def finish(self):
        if not self._run_state:
            raise ValueError('Begin a competition first.')
        while not self._run_state['complete']:
            self.spin()
        return self.state

    def set_formation(self, value=None):
        return self._run_call('formation', formation=value or self.formation.value)

    def swap(self, slot=None, bench_id=None):
        return self._run_call('swap', slot=self.slot.value if slot is None else slot,
                              bench_id=bench_id or self.sub.value)

    def play(self):
        response = self._run_call('match', seed=self.match_seed.value)
        self.score.value = wrap(response['html'])
        return response

    def repeated(self):
        response = self._run_call('series', seed=self.match_seed.value, n=self.trials.value)
        rows = [dict(outcome=k, probability=f'{v:.1%}', interval=str(response['sampling_intervals'][k]))
                for k, v in response['probabilities'].items()]
        self.score.value = wrap(self._table(rows, ('outcome', 'probability', 'interval'))
                                + '<p>' + escape(response['interval_note']) + '</p>')
        return response

    def advance(self):
        response = self._run_call('advance')
        self.score.value = wrap(response['html'])
        return response

    def manage(self, action=None, bench_id=None, free_agent_id=None):
        choice = action or self.manage_choice.value
        fields = dict(action=choice)
        if choice == 'freeagency':
            fields.update(bench_id=bench_id or self.free_agent_out.value,
                          free_agent_id=free_agent_id or self.free_agent_in.value)
        return self._run_call('manage', **fields)

    def _render_run(self, raw):
        self._run_state = raw
        self.state = self._public(raw)
        self._run_token = raw['token']
        self.mode.value = raw['mode']
        progress = raw['progress']
        self.status.value = wrap(f'<h2>{escape(raw["mode"].title())} · {raw["spins"]}/5 spins</h2>'
            f'<p>{escape(raw["era"])} · seed {raw["seed"]} · {escape(raw["manager"]["name"])}</p>'
            '<details><summary>Settings applied by the authority</summary><pre>'
            + escape(json.dumps(raw['config'], indent=2)) + '</pre></details>')
        self.batch.value = wrap('<div class="cards">' + ''.join(raw['cards']) + '</div>')
        self.board.value = wrap(raw['team_html']) if raw['team_html'] else ''
        self.spin_button.disabled = raw['complete']
        self.fill_button.disabled = raw['complete']
        self.formation.options = raw['formations']
        self.formation.value = raw['formation']
        self.slot.options = [(f'{s["slot"]}: {s["name"]}', s['index']) for s in raw['starters']]
        self.sub.options = [(p['name'], p['id']) for p in raw['bench']]
        unlocked = raw['complete'] and not raw['result']
        self.formation_button.disabled = not unlocked
        self.swap_button.disabled = not unlocked
        self.play_button.disabled = not (raw['complete'] and raw['mode'] in ('solo', 'weekly') and not raw['result'])
        self.series_button.disabled = not (raw['complete'] and raw['mode'] == 'solo')
        self.advance_button.disabled = not (raw['complete'] and raw['mode'] in ('gauntlet', 'league', 'circuit')
                                           and not progress.get('complete') and not progress.get('needs_management'))
        management = raw['mode'] == 'gauntlet' and progress.get('needs_management') and not progress.get('complete')
        self.manage_choice.options = [(a['label'], a['id']) for a in progress.get('actions', [])]
        self.manage_button.disabled = not management
        self.free_agent_out.options = [(p['name'], p['id']) for p in raw['bench']]
        self.free_agent_in.options = [(f'{p["name"]} · {p["tier"]} · {p["cost"]} patience', p['id'])
                                      for p in progress.get('free_agents', [])]
        metrics = [dict(field=k.replace('_', ' ').title(), value=v) for k, v in progress.items()
                   if isinstance(v, (str, int, float, bool)) and k != 'label']
        body = '<h2>Campaign progress</h2><p>' + escape(progress.get('label', '')) + '</p>'
        body += self._table(metrics, ('field', 'value'))
        if progress.get('standings'):
            body += self._table(progress['standings'], ('name', 'played', 'won', 'drawn', 'lost', 'goals_for', 'goals_against', 'points'))
        if progress.get('awards'):
            body += '<h3>Earned awards</h3>' + self._table(progress['awards'], ('name', 'event', 'player', 'goals'))
        self.progress.value = wrap(body)
        if raw.get('result'):
            self.score.value = wrap(result_html(raw['result']))
        return self.state

    def _build_career(self):
        eligible = [era for era in ERAS if self._meta['eligibility'][era]['eligible']]
        self.career_name = w.Text(value='Your Player', description='Player name:')
        self.career_position = w.Dropdown(options=['ST', 'CM', 'CB', 'GK'], value='CM', description='Position:')
        self.career_era = w.Dropdown(options=eligible, value='2020s' if '2020s' in eligible else eligible[0], description='Career era:')
        self.career_seed = w.BoundedIntText(value=self.seed.value, min=0, max=2**31-1, description='Career seed:')
        self.career_habit = w.Dropdown(options=['teamwork', 'composure', 'pressing'], description='Habit:')
        self.career_playbook = w.Dropdown(options=['possession', 'counter', 'press'], description='Playbook:')
        self.career_create_button = w.Button(description='Create football career', button_style='warning', layout=w.Layout(width='210px'))
        self.career_next_button = w.Button(description='Enter next fixture', button_style='info', disabled=True)
        self.career_retire_button = w.Button(description='Retire and save record', disabled=True, layout=w.Layout(width='190px'))
        self.career_board = w.HTML(value=wrap('<p>Create a player, then train or enter the first fixture. Four choices resolve a match.</p>'))
        self.career_options = {}
        self.career_buttons = {}
        groups = []
        for route in ('action', 'train', 'buy', 'talk'):
            selector = w.Dropdown(options=[], description=route.title()+':', layout=w.Layout(width='75%'))
            button = w.Button(description=route.title(), disabled=True)
            self.career_options[route] = selector
            self.career_buttons[route] = button
            button.on_click(lambda _, r=route: self._safe(lambda: self._career_call(r, self.career_options[r].value)))
            groups.append(w.HBox([selector, button]))
        self.career_create_button.on_click(lambda _: self._safe(self.career_create))
        self.career_next_button.on_click(lambda _: self._safe(self.career_next))
        self.career_retire_button.on_click(lambda _: self._safe(self.career_retire))
        self.career_ui = w.VBox([w.HBox([self.career_name, self.career_position]),
            w.HBox([self.career_era, self.career_seed]), w.HBox([self.career_habit, self.career_playbook]),
            self.career_create_button, w.HBox([self.career_next_button, self.career_retire_button]),
            *groups, self.career_board])

    def career_create(self, name=None, position=None):
        raw = self._service.call('league/create', dict(profile=self._profile_credential,
            name=name or self.career_name.value, position=position or self.career_position.value,
            era=self.career_era.value, seed=self.career_seed.value, habit=self.career_habit.value,
            playbook=self.career_playbook.value, action_id=uuid4().hex))
        self._career_token = raw['career_token']
        self._render_career(raw)
        self._save_session()
        return self.career_state

    def _career_call(self, route, choice=None):
        if not self._career_token:
            raise ValueError('Create a football career first.')
        body = dict(profile=self._profile_credential, career_token=self._career_token, action_id=uuid4().hex)
        if route in ('action', 'train', 'buy', 'talk'):
            body['choice'] = choice
        raw = self._service.call('league/'+route, body)
        self._render_career(raw)
        self._save_session()
        return self.career_state

    def career_next(self):
        return self._career_call('next')

    def career_action(self, choice):
        return self._career_call('action', choice)

    def career_train(self, choice):
        return self._career_call('train', choice)

    def career_buy(self, choice):
        return self._career_call('buy', choice)

    def career_talk(self, choice):
        return self._career_call('talk', choice)

    def career_retire(self):
        return self._career_call('retire')

    def _render_career(self, raw):
        self._career_state = raw
        self.career_state = self._public(raw)
        office = raw['phase'] == 'office' and not raw['complete']
        self.career_next_button.disabled = not office
        self.career_retire_button.disabled = not office
        for route, selector in self.career_options.items():
            key = 'choices' if route == 'action' else route+'_options'
            options = [o for o in raw[key] if o.get('enabled', True)]
            selector.options = [(o['label'] + (f' · {o["cost"]} credits' if 'cost' in o else ''), o['value']) for o in options]
            self.career_buttons[route].disabled = not options
        body = f'<h2>{escape(raw["name"])} · {escape(raw["position"])} · {escape(raw["club_name"])}</h2>'
        body += f'<p>Season {raw["season"]} · round {raw["round"]} · {escape(raw["phase"])}'
        if raw['phase'] == 'match':
            body += f' · stretch {raw["stretch"]+1}/4 · {escape(raw["opponent"])}'
        body += '</p><p>' + escape(raw['adaptation']) + '</p>'
        body += self._table([dict(field=k, value=raw[k]) for k in ('level','xp','credits','legs','control','momentum','injury')], ('field','value'))
        body += '<h3>Skills</h3>' + self._table([dict(skill=k, rank=v) for k, v in raw['skills'].items()], ('skill','rank'))
        body += '<h3>Standings</h3>' + self._table(raw['standings'], ('name','played','won','drawn','lost','points'))
        body += '<h3>Actual career summary</h3>' + self._table([dict(field=k, value=v) for k, v in raw['summary'].items()], ('field','value'))
        body += '<h3>Earned milestones</h3>' + self._table(raw['earned_awards'], ('name','description','level','season','round'))
        body += '<h3>Recent play</h3>' + self._table(list(reversed(raw['log'][-30:])), ('message',))
        body += '<details><summary>Football career rules</summary><p>' + escape(raw['rules']) + '</p></details>'
        body += raw['share_svg']
        self.career_board.value = wrap(body)
        return self.career_state

    def _build_local_room(self):
        self.room_create_button = w.Button(description='Create two-human local room', button_style='warning', layout=w.Layout(width='240px'))
        self.room_spin_buttons = [w.Button(description=f'Human {i+1}: spin', disabled=True) for i in range(2)]
        self.room_ready_buttons = [w.Button(description=f'Human {i+1}: ready', disabled=True) for i in range(2)]
        self.room_rematch_buttons = [w.Button(description=f'Human {i+1}: rematch', disabled=True) for i in range(2)]
        self.room_board = w.HTML()
        self.room_create_button.on_click(lambda _: self._safe(self.local_create))
        for i in range(2):
            self.room_spin_buttons[i].on_click(lambda _, seat=i: self._safe(lambda: self.local_spin(seat)))
            self.room_ready_buttons[i].on_click(lambda _, seat=i: self._safe(lambda: self.local_ready(seat)))
            self.room_rematch_buttons[i].on_click(lambda _, seat=i: self._safe(lambda: self.local_rematch(seat)))
        self.room_ui = w.VBox([w.HTML('<p>Two actual humans pass the notebook after each spin. This uses private local room APIs and has no automated human opponent. The draft era, seed and variant above apply; room rules fix the other settings.</p>'),
                              self.room_create_button, w.HBox(self.room_spin_buttons),
                              w.HBox(self.room_ready_buttons), w.HBox(self.room_rematch_buttons), self.room_board])

    def local_create(self):
        raw = self._service.call('room/create', dict(profile=self._profile_credential, local=True,
            era=self.era.value, seed=self.seed.value, variant=self.variant.value))
        self._room_code = raw['room']
        self._room_credentials = raw['local_credentials']
        self._render_room(raw)
        self._save_session()
        return self.room_state

    def _local_call(self, route, seat):
        if seat not in (0,1) or not self._room_code or len(self._room_credentials) != 2:
            raise ValueError('Create a local room and choose human 1 or 2.')
        raw = self._service.call('room/'+route, dict(room=self._room_code,
            credential=self._room_credentials[seat], action_id=uuid4().hex))
        self._render_room(raw)
        self._save_session()
        return self.room_state

    def local_spin(self, seat):
        return self._local_call('spin', seat)

    def local_ready(self, seat):
        return self._local_call('ready', seat)

    def local_rematch(self, seat):
        return self._local_call('rematch', seat)

    def local_refresh(self):
        raw = self._service.call('room/state', dict(room=self._room_code, credential=self._room_credentials[0]))
        self._render_room(raw)
        return self.room_state

    def _render_room(self, raw):
        self._room_state = raw
        self.room_state = self._public(raw)
        body = '<h2>Two-human local room</h2><p>' + escape(raw['label']) + '</p>'
        body += f'<p>Round {raw["round"]+1} · {escape(raw["phase"])}'
        if raw['turn'] is not None and not raw['result']:
            body += f' · pass to human {raw["turn"]+1}'
        body += '</p>'
        for i, seat in enumerate(raw['seats']):
            self.room_spin_buttons[i].disabled = bool(raw['result']) or seat['spins'] >= 5 or raw['turn'] != i
            self.room_ready_buttons[i].disabled = bool(raw['result']) or seat['spins'] != 5 or seat['ready']
            self.room_rematch_buttons[i].disabled = not raw['result'] or raw['rematch_votes'][i]
            body += f'<h3>Human {i+1}: {seat["count"]}/15 players</h3>'
            body += seat['team_html'] or '<div class="cards">' + ''.join(seat['cards']) + '</div>'
        if raw['result']:
            body += raw['result_html']
        self.room_board.value = wrap(body)
        return self.room_state

    def display(self):
        display(self.ui)
        return self

    def close(self):
        if self._owns_service:
            self._service.store.close()
