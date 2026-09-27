# Examples

One file per feature. They call a small fake shop API (`shop_api.py`) that starts on your machine, so they work offline.

| File | Shows |
|---|---|
| `test_01_tag_your_tests.py` | `@pytest.mark.meta`, `rl.meta()`, tags |
| `test_02_logs_and_test_data.py` | `rl.log()`, `rl.test_data()` as key/value, table and CSV |
| `test_03_api_calls.py` | every `requests` call recorded, and `rl.api()` for other clients |
| `test_04_steps.py` | `rl.step()`, nested and failing steps |
| `test_05_outcomes.py` | passed, failed, skipped, xfail, flaky, setup error, API down |
| `test_06_gorest_live.py` | the same against the public gorest.in API (set `RL_LIVE=1`) |

Some tests fail on purpose, so the report has something to explain.

## Run

```bash
pip install -e ..                         # this adapter
pip install requests pytest-rerunfailures
pytest
```

`pytest.ini` turns the report on (`reporting_labs = true`) and records API calls (`rl_capture_api = true`). Options live in `reporting-labs.config.json`.

Open `reporting-labs/index.html`. Run `pytest` again and the trend, "new vs known" failures and flaky history appear.
