# Player imports and identity review

The shipped dataset contains 625 cards for 551 stored person identities. Its file hash is
`4dac2fa5887eea643b77548c5a2810790068400bd82087bcdddea6e2d52dcd9c`.
The 157 Icon/Hero cards are published game reconstructions of historical players. The other
468 cards are edition snapshots. Detailed stamina is missing on all 157 reconstructed cards;
the game reports its configurable stamina fallback rather than calling it a historical measurement.
None of the bundled cards supplies a birth date, so birth-date matching cannot establish new
cross-source identities for that dataset.

The source URLs, publisher-declared CC0 licences, source filenames, selected editions and the
curation rules are in [data/manifest.json](../data/manifest.json). Existing curated person aliases
remain unchanged. This integration changes the import rules and does not rewrite the bundled
cards or their source manifest.

## Import a permitted user export

Keep large downloads and restricted source files outside the public repository. On this machine,
working source files belong in `Claude Func Folder`. Importing reads the chosen file and returns
validated dictionaries; it does not download data or write a new dataset.

```python
from era_eleven.data import import_ea_csv, import_pes_csv, pool_report

source = {
    "source": "my-approved-export",
    "source_url": "https://the-publisher.example/dataset",
    "source_date": "2024-06-07",
    "season": "2023-24",
    "license": {"name": "Use the actual source terms",
                "redistribution": "Record the actual permission"},
    "era_basis": "Explain the edition or curated playing-period choice",
}
players = import_ea_csv(raw_path, era="2020s", edition=24,
                        source_metadata=source)
report = pool_report(players)
```

`raw_path` is an explicit path to the user's export. The example metadata is a template and does
not grant redistribution permission. Missing licence information is recorded as unspecified,
with redistribution not established. The original metadata, source filename and SHA-256 are
retained in imported cards. A filename is stored rather than the machine's absolute source path.
The importer makes no claim that a user file is published or an official current edition.

## A card and a person have different identifiers

EA imports use the explicit `player_id`; PES imports use `ID` after normalizing column names.
The default person keys are `ea-<provider ID>` and `pes-<provider ID>`. Edition card IDs remain
separate from those person keys. EA's `fifa_version` identifies its edition; use `edition=` for
a PES export when the file does not have an edition column. Source IDs remain available in
`provider_player_id` even after a reviewed cross-source alias is applied.

Two rows with the same display name and different provider IDs remain different people. The
importer rejects fractional numeric IDs instead of truncating them. A missing provider ID now
raises an error with the row's override key. It never manufactures a person identity from a name.
Exports relying on the former name-only fallback must supply source IDs or reviewed mappings.

Use explicit aliases only after reviewing the source records:

```python
overrides = {
    "ea-123": {"identity": "person-reviewed-123",
               "evidence": "Record the reviewed source IDs and corroborating evidence",
               "dob": "1990-01-01", "nation": "The source nationality"},
    "pes-456": {"identity": "person-reviewed-123",
                "evidence": "Record why this PES record is the same person"},
}
ea = import_ea_csv(ea_path, identity_overrides=overrides)
pes = import_pes_csv(pes_path, edition="eFootball 2024",
                     identity_overrides=overrides)
```

The example IDs and birth date are placeholders. Each override requires a nonempty identity
and review evidence. A supplied birth date or nationality must agree with the corresponding
known source fields. Birth dates use `YYYY-MM-DD`; ambiguous date formats are rejected.
For a row without a provider ID, use `row:0`, `row:1`, and so on, referring to the original
zero-based CSV data-row index before edition filtering. Review each such row separately.
Its card ID derives from the reviewed identity rather than a display name.

`identity_review_candidates(left, right)` returns possible links with exact normalized full
name, birth date and nationality. Records lacking any of these fields yield no suggestion.
Every suggestion requires review and leaves both inputs unchanged. Multiple matching right
records are marked ambiguous. The helper does not assign identities, deduplicate cards or accept
similar names as proof. The upstream fas fuzzy matcher also remains a review tool; its greedy
matches do not implement birth-date checking or enforce one-to-one links.

## Inspect the attribute mapping

| Import | Default mapping | Evidence label |
| --- | --- | --- |
| EA export | Published attribute groups map directly; `physic` maps to physical, `power_stamina` to stamina, `mentality_vision` to vision, and `attacking_finishing` to finishing. Goalkeeper columns use the `goalkeeping_` names. | User-supplied snapshot; a custom mapping is labelled a proxy. |
| PES export | Pace averages speed and acceleration; shooting averages finishing and kicking power; passing averages low and lofted pass. Other groups use the source columns recorded on each card. | PES group mapping proxy. These groups are not claimed equivalent to EA measurements. |

`attribute_mapping` is editable. Each target attribute accepts one source column or a list:

```python
players = import_pes_csv(pes_path, edition="eFootball 2024",
                         attribute_mapping={"passing": ["low_pass", "lofted_pass"]})
print(players[0]["attribute_mapping"])
print(players[0]["attribute_completeness"])
print(players[0]["missing_source_columns"])
print(players[0]["missing_attributes"])
```

Groups average the available mapped values, matching the existing PES rule. Their available
and expected column counts expose partially observed groups. Entirely missing groups remain
`None`; no ratings are filled in during import. Gameplay requires the six outfield groups or
the five supported goalkeeper groups, plus overall, as finite values from 0 to 99. Optional
stamina, vision and finishing may remain missing. An incomplete required group is rejected with
the player's name and field, so a user can supply the missing evidence or revise the mapping.

## Check the pool before drafting

`validate_players(players)` checks card IDs, explicit person identities, supported positions
and rating ranges. Conflicting known birth dates for one person identity are rejected rather
than merging the records. `pool_report(players, config=...)` adds person/card counts, distinct-person
coverage by position, attribute missingness, source licence declarations and the game engine's
era eligibility report. A pool without a goalkeeper is reported ineligible instead of receiving
a hidden extra card. Reports preserve the source data and do not modify the player's ratings.

The engine checks the manager's compatible formation plus goalkeeper, defender, midfielder
and attacker reserves. It groups alternative editions of one person for this eligibility check.
This establishes available positional coverage; it does not certify a salary cap, tier quota
or every random edition selection. The actual draft validates its chosen fifteen-person squad.
The Classics subset remains unavailable as its own draft era under the game's current rules,
while its cards remain available in Legends and All eras.

## Reproduce the checks

```text
python -m unittest discover -s tests -p test_data.py -v
```

On 2026-10-06, the regression suite passed 18 tests. The initial run reproduced the missing-ID
name fallback and fractional-ID truncation defects before the implementation was changed.
The passing run covers separate same-name people, reviewed cross-provider aliases, missing-ID
row reviews, metadata and licence retention, editable mappings, birth-date conflict rejection,
era/goalkeeper coverage and the unchanged bundled file hash. Machine-specific raw logs and
source audit are stored in `Claude Func Folder/football-integration/analytics` and are excluded
from the public project.
