from pathlib import Path

from reporting_labs import config as rlconfig
from reporting_labs import environment


def test_build_options_defaults(tmp_path):
    o = rlconfig.build_options({}, tmp_path, env={})
    assert o == {
        "theme": "auto",
        "palette": "lab",
        "embedFonts": True,
        "sections": [],
        "widgets": {w: True for w in rlconfig.WIDGETS},
        "dimensions": ["priority", "severity", "feature", "owner"],
        "dimensionOrder": {
            "priority": ["P0", "P1", "P2", "P3", "P4"],
            "severity": ["blocker", "critical", "major", "high", "medium", "normal", "minor", "low", "trivial"],
        },
        "links": {},
        "customCss": "",
        "editorLinks": True,
    }
    assert rlconfig.build_options({}, tmp_path, env={"CI": "true"})["editorLinks"] is False


def test_build_options_values(tmp_path):
    (tmp_path / "logo.svg").write_text("<svg/>")
    o = rlconfig.build_options({
        "logo": "logo.svg", "accent": "#7C3AED", "theme": "dark", "palette": "ocean", "embedFonts": False,
        "widgets": {"timeline": False}, "dimensions": ["Priority", "Team"], "dimensionOrder": {"team": ["web", "api"]},
        "project": {"name": "Shop"}, "links": {"story": "https://j/{id}"}, "customCss": "body{}", "editorLinks": True,
    }, tmp_path, env={"CI": "1"})
    assert o["logo"].startswith("data:image/svg+xml;base64,")
    assert o["widgets"]["timeline"] is False and o["widgets"]["flaky"] is True
    assert o["dimensions"] == ["priority", "team"]
    assert o["dimensionOrder"]["team"] == ["web", "api"] and "severity" in o["dimensionOrder"]
    assert o["editorLinks"] is True and o["embedFonts"] is False
    assert rlconfig.build_options({"logo": "https://x/logo.png"}, tmp_path, env={})["logo"] == "https://x/logo.png"


def test_meta_keys():
    keys = rlconfig.meta_keys({"dimensions": ["priority", "team"], "links": {"JIRA": "x", "*": "y"}})
    assert keys[:2] == ["priority", "team"]
    assert "story" in keys and "component" in keys and "jira" in keys and "*" not in keys
    assert len(keys) == len(set(keys))


def test_ci_run_label():
    assert environment.ci_run_label({"GITHUB_RUN_NUMBER": "12"}) == "#12"
    assert environment.ci_run_label({"BUILD_NUMBER": "7"}) == "#7"
    assert environment.ci_run_label({}) is None


def test_ci_link():
    gh = {"GITHUB_ACTIONS": "true", "GITHUB_SERVER_URL": "https://github.com", "GITHUB_REPOSITORY": "o/r", "GITHUB_RUN_ID": "99", "GITHUB_RUN_NUMBER": "5"}
    assert environment.ci_link(gh) == {"name": "GitHub Actions #5", "url": "https://github.com/o/r/actions/runs/99"}
    jk = {"JENKINS_URL": "https://ci", "BUILD_URL": "https://ci/job/api/3/", "JOB_NAME": "api", "BUILD_NUMBER": "3"}
    assert environment.ci_link(jk) == {"name": "Jenkins api #3", "url": "https://ci/job/api/3/"}
    assert environment.ci_link({"GITLAB_CI": "1", "CI_JOB_URL": "u", "CI_PIPELINE_IID": "4"}) == {"name": "GitLab CI #4", "url": "u"}
    assert environment.ci_link({"CI": "1"}) == {"name": "CI"}
    assert environment.ci_link({}) is None


def test_git_info_outside_a_repo_falls_back_to_env(tmp_path):
    info = environment.git_info(tmp_path, {"GITHUB_SHA": "abcdef1234", "GITHUB_ACTOR": "asha", "GITHUB_REF_NAME": "main",
                                           "GITHUB_SERVER_URL": "https://github.com", "GITHUB_REPOSITORY": "o/r"})
    assert info == {"sha": "abcdef1234", "author": "asha", "branch": "main", "url": "https://github.com/o/r/commit/abcdef1234"}


def test_git_info_in_this_repo():
    info = environment.git_info(Path(__file__).parent, {})
    assert len(info.get("sha", "")) == 40


def test_collect_env_rows(tmp_path):
    rows = environment.collect_env(tmp_path, {"env": {"App": "2.4", "Docs": "https://d"}, "metadata": {}}, {"CI": "1"}, workers=3)
    keys = [r["k"] for r in rows]
    assert keys[:4] == ["Python", "pytest", "reportingLabs", "OS"]
    assert "Workers" in keys and "CI" in keys
    assert rows[-1] == {"k": "Docs", "v": "https://d", "href": "https://d"} and rows[-2] == {"k": "App", "v": "2.4"}
