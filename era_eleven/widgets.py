"""Interactive Jupyter controls for the same engine used by the local game."""
from pathlib import Path
import json
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
