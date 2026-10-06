# Browser workflow checks

Start the Python game server and make Playwright's Node package/Chromium available (tested with Playwright 1.59.1). `ERA_ELEVEN_PLAYWRIGHT` may name an existing package directory; otherwise Node resolves `playwright` normally. The four checks are portable and use actual browser controls, independent contexts, authoritative API assertions and reloads. The controls check waits for real 60/120-second timers.

Set `ERA_ELEVEN_URL` to the running server and **set `ERA_ELEVEN_TEST_OUTPUT` to your project work folder**. Screenshots, private test databases, profile access and generated exports must stay outside the public checkout. On the development machine, the output folder belongs in `Claude Func Folder/football-integration/browser`; invoke `node.exe` directly.

```text
node tests/browser/acceptance.cjs
node tests/browser/acceptance-controls.cjs
node tests/browser/presentation-review.cjs
node tests/browser/management-review.cjs
```

Each script writes a result JSON and exits nonzero on failure. Start with a new browser context/database when validating a changed release. Never publish generated profile access or room credentials. Mini-answer oracles use the bundled public card dataset; they check the real input path, not hidden server state.
