# reportingLabs for pytest

**The reportingLabs HTML report, for pytest. Built for API tests.**

Run your tests, get one HTML file. It shows what broke, who owns it, and whether it is new. Every `requests` and `httpx` call can land in the report with its status, timing, headers and bodies. Secrets are masked.

This is a pytest plugin. It collects the run in Python and uses the reportingLabs npm package to draw the HTML. So you need **Node.js 18+** on the machine that makes the report.

## Quick start (2 minutes)

**1. Install**

```bash
pip install "git+https://github.com/naveenautomationlabs/reporting-labs.git#subdirectory=adapters/pytest"
```

Not on PyPI yet. From a clone, `pip install -e adapters/pytest` works too.

**2. Run your tests with `--rl`**

```bash
pytest --rl --rl-capture-api
```

`--rl` turns the report on. `--rl-capture-api` records every `requests` and `httpx` call.

**3. Open the report**

It is at `reporting-labs/index.html`. It opens in your browser by itself when something failed (not in CI).

Done. Everything below is optional.

> **Always on?** Put this in `pytest.ini` (or `[tool.pytest.ini_options]` in `pyproject.toml`):
>
> ```ini
> [pytest]
> reporting_labs = true
> rl_capture_api = true
> ```

## How the HTML is made

At the end of the run the plugin writes `reporting-labs/.raw/report.json`. Then it runs:

```bash
npx -y reporting-labs@0.6.1 merge reporting-labs/.raw --out reporting-labs
```

That is the same `merge` command Playwright users run to combine shards. The version is pinned, so the report looks the same on every machine.

- **No Node?** The run still passes or fails on its own. `report.json` stays, and the plugin prints the exact command to run later.
- **Offline?** Same thing. Run the printed command when you are back online.
- **Just the data?** Use `--rl-no-render`.
- **npm warns about `@playwright/test`?** That is a peer dependency of the npm package. `merge` does not use it. The warning is harmless.
- **Another version?** Set `RL_RENDER_PACKAGE`, for example `RL_RENDER_PACKAGE=reporting-labs@latest`, or a path to a `.tgz`.

## Add details to your tests

The report already shows outcomes, errors, retries, output and API calls on its own. A few helpers add the rest.

```python
import pytest
import reporting_labs as rl
```

Every helper does nothing when the report is off, so you can leave them in.

### `@pytest.mark.meta`: who owns this test and how important it is

```python
@pytest.mark.meta(priority="P1", severity="critical", owner="asha", feature="checkout", story="SHOP-231")
def test_checkout(): ...
```

- `priority`, `severity`, `feature` and `owner` get charts and filters.
- `epic`, `story`, `issue`, `component` and `team` show on the test. They become links when you set `links` in the config.
- Any other key is kept too and shows on the test.
- A `meta` marker on a class applies to every test in it. A marker on the test wins.
- Other markers show as tags: `@pytest.mark.smoke` becomes `@smoke`. `@pytest.mark.P1` sets priority, like `@P1` in Playwright.

Only know the value at run time? Call `rl.meta(...)` inside the test.

After the run, the plugin lists tests that have no meta, so the report stays useful for the whole team. Set `"warnMissingMeta": false` to hide it.

### `rl.log()`: a timestamped line

```python
rl.log("cart total before coupons:", 99.0)
rl.log("warn: no discount code")     # amber
rl.log("error: stock is 0")          # red
```

### `rl.test_data()`: the data the test used

```python
rl.test_data({"user": "asha", "password": "S3cret"}, "Login")        # key/value, password shows as ****
rl.test_data([{"sku": "A1", "qty": 2}, {"sku": "B2", "qty": 1}], "Cart")  # table
rl.test_data(open("users.csv").read(), "Users")                     # CSV -> table
rl.test_data("any other text", "Note")                              # text
```

A string counts as CSV when it has at least two lines and a comma in the first line.

### `rl.step()`: named steps

```python
with rl.step("Create the order"):
    with rl.step("Add items"):
        ...
    with rl.step("Pay"):
        ...
```

Steps nest and show their time. A failing step turns red and the error is raised as usual. Titles that start with Given, When or Then are styled as Gherkin.

### `rl.api()`: an API call made with any other client

```python
rl.api(method="POST", url="/v1/orders", status=201, duration=138,
       request_body=payload, response_body=resp_json)
```

You do not need this for `requests` and `httpx` when capture is on.

## API capture

Turn it on with `--rl-capture-api` or `rl_capture_api = true`.

- **What is patched:** `requests.Session.send`, which covers `requests.get()` and every Session. `httpx.Client.send` and `httpx.AsyncClient.send` too, when httpx is installed.
- **What is kept for each call:** method, URL (after redirects), status, time in ms, request and response headers, and both bodies.
- **Bodies:** JSON is parsed. Text stays text. Forms become key/value. Images and other binary show as `<image/png 1234 bytes>`. Bodies over 200 KB are cut. Change that with `rl_api_max_body = 50000` (bytes). Streamed responses are not read.
- **No answer:** a call that gets no answer (connection refused, DNS, timeout, TLS) is kept with no status, and the error as the body.
- **Masking:** `Authorization`, `Cookie`, `Set-Cookie`, tokens, passwords and keys are masked in headers and bodies.

**Which test gets the call?** The one that is running. Setup and teardown count as part of the test:

- A `function` scoped fixture: its calls land on its test.
- A `session`, `module` or `class` scoped fixture: its setup runs inside the first test that uses it, so those calls land there. Its teardown runs after the last test, so those calls land on the last test.
- Calls from threads started by the test land on that test.
- Calls outside any test (import time, `conftest.py` hooks) are not recorded.

## Failures in plain words

Each error keeps pytest's own message and traceback. Next to it the report adds a short explanation, for example:

| pytest says | The report says |
|---|---|
| `assert 404 == 200` (from `r.status_code`) | The API returned status 404, the test expected 200. Check the path and the id. |
| `requests.exceptions.ConnectionError ... Connection refused` | The API request could not be sent: nothing is listening on that address. |
| `KeyError: 'id'` | The key 'id' was not there. The response did not have the expected shape. |
| `jsonschema ... ValidationError` / pydantic `validation error` | The response did not match the schema / model, with the fields. |
| `Failed: Timeout (>2.0s) from pytest-timeout` | The whole test took longer than 2s. |

DNS errors, timeouts, TLS errors, `raise_for_status()`, bad JSON, missing files and fixtures, and common Python errors are covered too. The Playwright rules are kept, so pytest-playwright errors read the same as in the Playwright reporter.

## Outcomes

| pytest | Report |
|---|---|
| passed | Passed |
| failed, or an error in setup or teardown | Failed. The error belongs to the test. |
| skipped | Skipped, with the reason |
| xfail that fails | Passed, marked "Expected failure" |
| xfail that passes (strict or not) | Failed, with a note: remove the marker if the bug is fixed |
| fails, then passes on a rerun ([pytest-rerunfailures](https://github.com/pytest-dev/pytest-rerunfailures)) | Flaky. Every attempt is kept. |
| [pytest-timeout](https://github.com/pytest-dev/pytest-timeout) hit | Timed out |
| Ctrl+C | Interrupted. Tests that never ran say so. |
| not run after `-x` / `--maxfail` | Skipped, with the reason |
| an error while collecting a file | Shown at the top of the report. The run is marked failed. |

**pytest-xdist:** `-n 4` just works. Workers send everything to the main process, which writes the one report. The timeline shows each worker.

## Options

| Command line | ini key | Default | What it does |
|---|---|---|---|
| `--rl` | `reporting_labs = true` | off | Make the report |
| `--rl-out DIR` | `rl_out` | `reporting-labs` | Report folder |
| `--rl-config FILE` | `rl_config` | `reporting-labs.config.json` | Options file |
| `--rl-title TEXT` | `rl_title` | `Test report` | Report title |
| `--rl-no-render` | `rl_no_render = true` | off | Only write `.raw/report.json` |
| `--rl-capture-api` | `rl_capture_api = true` | off | Record `requests` / `httpx` calls |
| | `rl_api_max_body` | `204800` | Largest body kept, in bytes |
| | `rl_project` | empty | Project name on every test |

Command line wins over ini, and ini wins over the JSON file. Command line paths are relative to where you run pytest. ini paths are relative to the pytest rootdir.

### `reporting-labs.config.json`

Put it next to your `pytest.ini`. It takes the same keys as the Playwright `reporting-labs.config.ts`, with the same defaults:

```json
{
  "title": "Shop API tests",
  "project": { "name": "Shop API", "version": "2.4.0", "team": "QA Platform" },
  "metadata": { "env": "staging" },
  "links": { "story": "https://acme.atlassian.net/browse/{id}" },
  "maskKeys": ["x-tenant-id"],
  "env": { "API": "https://staging.api.example.com" },
  "open": "on-failure",
  "history": { "keep": 30 }
}
```

These work: `title`, `logo`, `accent`, `theme`, `palette`, `outputFolder`, `outputFile`, `metadata`, `sections`, `widgets`, `dimensions`, `dimensionOrder`, `customCss`, `embedFonts`, `announce`, `warnMissingMeta`, `open`, `project`, `links`, `maskKeys`, `history`, `env`, `editorLinks`, `bdd`.

These do nothing here: `embedAttachments`, `embedLimit` and `embedVideos` (there are no screenshots or videos), `emitJson` (the JSON is always written) and `jsonFile` (`merge` needs the name `report.json`).

Paths in the file (`outputFolder`, `logo`, `history.file`) are relative to the file.

## Run history

Every run adds a line to `reporting-labs.history.json` next to the config. The last 30 runs are kept. This powers the trend chart, "new vs known" failures, flaky history and "got slower". It is the same file and format as the Playwright reporter.

In CI, keep that file between runs with a cache. The run is labelled with `metadata.build`, else the CI run number, else `metadata.branch`.

## CI

### GitHub Actions

```yaml
jobs:
  api-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - uses: actions/setup-node@v4        # makes the HTML
        with:
          node-version: 24

      - run: pip install -r requirements.txt "git+https://github.com/naveenautomationlabs/reporting-labs.git#subdirectory=adapters/pytest"

      # Keep the run history between jobs, for trend, new vs known and flaky history.
      - uses: actions/cache@v4
        with:
          path: reporting-labs.history.json
          key: reporting-labs-history-${{ github.ref_name }}-${{ github.run_id }}
          restore-keys: |
            reporting-labs-history-${{ github.ref_name }}-

      - run: pytest --rl --rl-capture-api

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-report
          path: reporting-labs/
          retention-days: 30
```

The report links the job and the commit by itself.

### Jenkins

```groovy
pipeline {
  agent any
  stages {
    stage('API tests') {
      steps {
        // Bring back the history from the last build, if there is one.
        copyArtifacts(projectName: env.JOB_NAME, selector: lastCompleted(), filter: 'reporting-labs.history.json', optional: true)
        sh 'pip install -r requirements.txt "git+https://github.com/naveenautomationlabs/reporting-labs.git#subdirectory=adapters/pytest"'
        sh 'pytest --rl --rl-capture-api'
      }
    }
  }
  post {
    always {
      archiveArtifacts artifacts: 'reporting-labs/**, reporting-labs.history.json', allowEmptyArchive: true
      // With the HTML Publisher plugin:
      publishHTML(target: [reportDir: 'reporting-labs', reportFiles: 'index.html', reportName: 'reportingLabs', keepAll: true, allowMissing: true])
    }
  }
}
```

`copyArtifacts` needs the Copy Artifact plugin. The agent needs Node 18+ on the `PATH`.

## Good to know

- **The Environment card shows `Shards: shard-1`.** The `merge` command adds that row. It is harmless. It goes away once the npm package has a render command of its own.
- **No screenshots, videos or traces.** pytest has none of its own. The Attachments part of a test stays empty.
- **Masking is a little stricter than in the Playwright reporter.** A bare JWT or an `sk_…`, `ghp_…`, `AKIA…` key in free text becomes `****`. The Playwright reporter keeps the token and adds ` ****` after it.
- **Test lines point at the first decorator.** That is where pytest says the test starts.
- **Asserts in helper modules** only show values when pytest rewrites them. Add `pytest.register_assert_rewrite("my_helpers")` in `conftest.py`.

## Examples

See [`examples/`](examples/): one file per feature, against a small fake API that runs on your machine.

## For contributors

```bash
cd adapters/pytest
python -m venv .venv && . .venv/bin/activate
pip install -e ".[test]"
npm ci --prefix tools          # TypeScript + jsdom for the contract and e2e tests
pytest                          # unit, pytester, xdist, contract and e2e tests
```

Without Node or `tools/node_modules`, the contract and e2e tests are skipped. Set `RL_REQUIRE_NODE=1` to make them fail instead, for example in CI.

Some Python files are ports of the TypeScript code and must follow it:

| Python | TypeScript |
|---|---|
| `schema.py` | `src/types.ts` |
| `masking.py` | `src/mask.ts` |
| `explain.py` | `src/explain.ts` (plus pytest and API rules) |
| `history.py`, `environment.py`, `config.py`, parts of `collector.py` | `src/reporter.ts` |

`tests/test_contract.py` type-checks real output against `src/types.ts` and runs `src/mask.ts` on the same inputs as `masking.py`, so a drift shows up as a failing test. When you bump the npm version, change `RL_VERSION` in `schema.py` too.
