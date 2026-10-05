"""Keep server-authoritative runs and browser profiles in a local SQLite file."""
import json
import sqlite3
from pathlib import Path


class Store:
    def __init__(self, path):
        if str(path) != ':memory:':
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(str(path), check_same_thread=False)
        self.connection.execute('CREATE TABLE IF NOT EXISTS objects (kind TEXT, key TEXT, value TEXT, PRIMARY KEY(kind,key))')

    def get(self, kind, key):
        row = self.connection.execute('SELECT value FROM objects WHERE kind=? AND key=?', (kind, key)).fetchone()
        if row is None:
            raise ValueError('Saved state or credential was not found on this server.')
        return json.loads(row[0])

    def put(self, kind, key, value):
        self.connection.execute('INSERT INTO objects VALUES(?,?,?) ON CONFLICT(kind,key) DO UPDATE SET value=excluded.value',
                                (kind, key, json.dumps(value, ensure_ascii=False, allow_nan=False)))

    def all(self, kind):
        return [json.loads(r[0]) for r in self.connection.execute('SELECT value FROM objects WHERE kind=?', (kind,))]

    def close(self):
        self.connection.close()
