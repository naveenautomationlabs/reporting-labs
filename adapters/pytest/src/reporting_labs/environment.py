"""Environment card rows: Python, pytest, OS, CI job and git commit.

The CI and git logic is a port of ciRunLabel, ciLink and gitInfo in src/reporter.ts
(reporting-labs 0.6.1). It reads the same environment variables.
"""
from __future__ import annotations

import platform
import re
import subprocess
from pathlib import Path
from typing import Dict, List, Mapping, Optional

try:
    from importlib.metadata import PackageNotFoundError, version
except ImportError:  # pragma: no cover
    from importlib_metadata import PackageNotFoundError, version  # type: ignore

PLUGIN_NAME = "pytest-reporting-labs"


def package_version(name: str) -> Optional[str]:
    try:
        return version(name)
    except PackageNotFoundError:
        return None


def ci_run_label(env: Mapping[str, str]) -> Optional[str]:
    """Run number from the CI system, used to label history entries when metadata.build is not set."""
    for k in ("GITHUB_RUN_NUMBER", "BUILD_NUMBER", "CI_PIPELINE_IID", "CIRCLE_BUILD_NUM", "BUILD_BUILDNUMBER", "BITBUCKET_BUILD_NUMBER"):
        if env.get(k):
            return f"#{env[k]}"
    return None


def ci_link(env: Mapping[str, str]) -> Optional[Dict[str, str]]:
    g = env.get
    if g("GITHUB_ACTIONS") and g("GITHUB_SERVER_URL") and g("GITHUB_REPOSITORY") and g("GITHUB_RUN_ID"):
        return {"name": f"GitHub Actions #{g('GITHUB_RUN_NUMBER') or g('GITHUB_RUN_ID')}",
                "url": f"{g('GITHUB_SERVER_URL')}/{g('GITHUB_REPOSITORY')}/actions/runs/{g('GITHUB_RUN_ID')}"}
    if g("GITLAB_CI") and g("CI_JOB_URL"):
        return {"name": f"GitLab CI #{g('CI_PIPELINE_IID') or g('CI_JOB_ID')}", "url": g("CI_JOB_URL")}
    if g("JENKINS_URL") and g("BUILD_URL"):
        return {"name": f"Jenkins {g('JOB_NAME') or ''} #{g('BUILD_NUMBER') or ''}".strip(), "url": g("BUILD_URL")}
    if g("CIRCLECI") and g("CIRCLE_BUILD_URL"):
        return {"name": f"CircleCI #{g('CIRCLE_BUILD_NUM') or ''}".strip(), "url": g("CIRCLE_BUILD_URL")}
    if g("TF_BUILD") and g("SYSTEM_TEAMFOUNDATIONCOLLECTIONURI") and g("SYSTEM_TEAMPROJECT") and g("BUILD_BUILDID"):
        return {"name": f"Azure Pipelines #{g('BUILD_BUILDNUMBER') or g('BUILD_BUILDID')}",
                "url": f"{g('SYSTEM_TEAMFOUNDATIONCOLLECTIONURI')}{g('SYSTEM_TEAMPROJECT')}/_build/results?buildId={g('BUILD_BUILDID')}"}
    if g("BITBUCKET_BUILD_NUMBER") and g("BITBUCKET_GIT_HTTP_ORIGIN"):
        return {"name": f"Bitbucket Pipelines #{g('BITBUCKET_BUILD_NUMBER')}",
                "url": f"{g('BITBUCKET_GIT_HTTP_ORIGIN')}/addon/pipelines/home#!/results/{g('BITBUCKET_BUILD_NUMBER')}"}
    if g("CI"):
        return {"name": "CI"}
    return None


def _run(cmd: List[str], cwd: Path) -> str:
    try:
        return subprocess.run(cmd, cwd=str(cwd), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=2,
                              check=False).stdout.decode("utf-8", "replace").strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def git_info(cwd: Path, env: Mapping[str, str]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    line = _run(["git", "log", "-1", "--format=%H%x1f%an%x1f%s"], cwd)
    if line:
        parts = line.split("\x1f")
        out["sha"], out["author"], out["subject"] = (parts + ["", "", ""])[:3]
    sha = out.get("sha") or env.get("GITHUB_SHA") or env.get("CI_COMMIT_SHA") or env.get("GIT_COMMIT") or env.get("CIRCLE_SHA1") or env.get("BUILD_SOURCEVERSION")
    author = out.get("author") or env.get("GITHUB_ACTOR") or env.get("CI_COMMIT_AUTHOR")
    branch = _run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd)
    branch = (branch if branch and branch != "HEAD" else "") or env.get("GITHUB_REF_NAME") or env.get("CI_COMMIT_REF_NAME") or env.get("GIT_BRANCH") or env.get("BUILD_SOURCEBRANCHNAME")
    result: Dict[str, str] = {}
    if sha:
        result["sha"] = sha
    if author:
        result["author"] = author
    if out.get("subject"):
        result["subject"] = out["subject"]
    if branch:
        result["branch"] = branch
    if sha:
        if env.get("GITHUB_SERVER_URL") and env.get("GITHUB_REPOSITORY"):
            result["url"] = f"{env['GITHUB_SERVER_URL']}/{env['GITHUB_REPOSITORY']}/commit/{sha}"
        elif env.get("CI_PROJECT_URL"):
            result["url"] = f"{env['CI_PROJECT_URL']}/-/commit/{sha}"
        else:
            remote = _run(["git", "config", "--get", "remote.origin.url"], cwd)
            m = re.search(r"github\.com[:/]([^/]+/[^/.]+)", remote)
            if m:
                result["url"] = f"https://github.com/{m.group(1)}/commit/{sha}"
    return result


def collect_env(base: Path, options: Mapping, env: Mapping[str, str], workers: int) -> List[Dict[str, str]]:
    """Rows for the Environment card, in the same order as reporter.ts collectEnv."""
    rows: List[Dict[str, str]] = [
        {"k": "Python", "v": f"{platform.python_version()} ({platform.python_implementation()})"},
        {"k": "pytest", "v": package_version("pytest") or "?"},
        {"k": "reportingLabs", "v": f"{PLUGIN_NAME} {package_version(PLUGIN_NAME) or '?'}"},
        {"k": "OS", "v": f"{platform.system()} {platform.release()} ({platform.machine()})"},
    ]
    plugins = [f"{n} {v}" for n, v in ((n, package_version(n)) for n in ("pytest-xdist", "pytest-rerunfailures", "pytest-timeout", "requests", "httpx")) if v]
    if plugins:
        rows.append({"k": "Plugins", "v": ", ".join(plugins)})
    if workers > 1:
        rows.append({"k": "Workers", "v": str(workers)})
    ci = ci_link(env)
    if ci:
        row = {"k": "CI", "v": ci["name"]}
        if ci.get("url"):
            row["href"] = ci["url"]
        rows.append(row)
    git = git_info(base, env)
    if git.get("sha"):
        v = git["sha"][:7] + (f" · {git['author']}" if git.get("author") else "") + (f" · {git['subject']}" if git.get("subject") else "")
        row = {"k": "Commit", "v": v}
        if git.get("url"):
            row["href"] = git["url"]
        rows.append(row)
    if git.get("branch") and not (options.get("metadata") or {}).get("branch"):
        rows.append({"k": "Branch", "v": git["branch"]})
    for k, v in (options.get("env") or {}).items():
        row = {"k": str(k), "v": str(v)}
        if re.match(r"^https?://", str(v)):
            row["href"] = str(v)
        rows.append(row)
    return rows
