"""TypedDict mirror of the report data shape.

Source of truth: src/types.ts in the reporting-labs repository, version 0.6.1
(the same version render.py pins for `npx reporting-labs merge`).
If src/types.ts changes, change this file too. tests/test_contract.py type-checks
real output against src/types.ts, so a drift shows up there.

Optional TypeScript fields (`name?: type`) live in a `total=False` base class.
"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Tuple, TypedDict

RL_VERSION = "0.6.1"

Status = Literal["passed", "failed", "skipped", "flaky", "timedOut", "interrupted"]


class _ApiCallOptional(TypedDict, total=False):
    status: int
    duration: float
    requestHeaders: Dict[str, str]
    requestBody: Any
    responseHeaders: Dict[str, str]
    responseBody: Any
    name: str


class ApiCall(_ApiCallOptional):
    method: str
    url: str


class _HistoryEntryOptional(TypedDict, total=False):
    label: str
    # Per-test outcome and last-attempt duration, keyed by TestData.key.
    # Codes: p passed, f failed, k flaky, s skipped.
    tests: Dict[str, Tuple[str, float]]


class HistoryEntry(_HistoryEntryOptional):
    time: float
    duration: float
    passed: int
    failed: int
    flaky: int
    skipped: int
    total: int


class _EnvRowOptional(TypedDict, total=False):
    href: str


class EnvRow(_EnvRowOptional):
    k: str
    v: str


class _ErrorExplainOptional(TypedDict, total=False):
    hint: str
    locator: str
    action: str
    matcher: str
    timeoutMs: float
    url: str


class ErrorExplainData(_ErrorExplainOptional):
    kind: str
    label: str
    summary: str


class ErrorLocation(TypedDict):
    file: str
    line: int
    column: int


class _ErrorDataOptional(TypedDict, total=False):
    stack: str
    snippet: str
    location: ErrorLocation
    explain: ErrorExplainData


class ErrorData(_ErrorDataOptional):
    message: str


class _StepDataOptional(TypedDict, total=False):
    error: str


class StepData(_StepDataOptional):
    title: str
    category: str
    duration: float
    steps: List["StepData"]


class _AttachmentOptional(TypedDict, total=False):
    src: str
    text: str
    size: int


class AttachmentData(_AttachmentOptional):
    name: str
    contentType: str


class LogLine(TypedDict):
    t: float
    msg: str


class _DataBlockOptional(TypedDict, total=False):
    columns: List[str]
    rows: List[List[str]]
    kv: List[Tuple[str, str]]
    text: str


class DataBlock(_DataBlockOptional):
    name: str
    kind: Literal["table", "kv", "text"]


class ResultData(TypedDict):
    retry: int
    status: str
    duration: float
    startTime: float
    workerIndex: int
    errors: List[ErrorData]
    steps: List[StepData]
    attachments: List[AttachmentData]
    stdout: List[str]
    stderr: List[str]
    logs: List[LogLine]
    data: List[DataBlock]
    api: List[ApiCall]


class Annotation(TypedDict, total=False):
    type: str
    description: str


class _TestDataOptional(TypedDict, total=False):
    expectedStatus: str
    expectedFailure: bool
    note: str
    timeout: float
    retries: int
    column: int


class TestData(_TestDataOptional):
    id: str
    key: str
    title: str
    path: List[str]
    file: str
    line: int
    project: str
    tags: List[str]
    annotations: List[Annotation]
    meta: Dict[str, str]
    outcome: Status
    duration: float
    results: List[ResultData]


class Widgets(TypedDict):
    runStrip: bool
    outcome: bool
    attention: bool
    dimensions: bool
    timeline: bool
    durations: bool
    tags: bool
    slowest: bool
    projects: bool
    flaky: bool
    environment: bool
    skipped: bool


class Section(TypedDict):
    title: str
    html: str


class _OptionsOptional(TypedDict, total=False):
    logo: str
    accent: str
    project: Dict[str, str]


class ReportOptions(_OptionsOptional):
    theme: Literal["auto", "light", "dark"]
    palette: Literal["lab", "ocean", "ember", "mono"]
    embedFonts: bool
    sections: List[Section]
    widgets: Widgets
    dimensions: List[str]
    dimensionOrder: Dict[str, List[str]]
    links: Dict[str, str]
    customCss: str
    editorLinks: bool


class GlobalOutput(TypedDict):
    stream: Literal["out", "err"]
    text: str


class Shard(TypedDict):
    current: int
    total: int


class _ReportDataOptional(TypedDict, total=False):
    shard: Shard


class ReportData(_ReportDataOptional):
    title: str
    generatedAt: float
    startTime: float
    duration: float
    metadata: Dict[str, str]
    projects: List[str]
    workers: int
    stats: Dict[str, int]
    tests: List[TestData]
    history: List[HistoryEntry]
    bdd: bool
    rootDir: str
    env: List[EnvRow]
    runStatus: Literal["passed", "failed", "timedout", "interrupted"]
    globalErrors: List[ErrorData]
    globalOutput: List[GlobalOutput]
    options: ReportOptions


__all__ = [
    "RL_VERSION", "Status", "ApiCall", "HistoryEntry", "EnvRow", "ErrorExplainData", "ErrorData",
    "StepData", "AttachmentData", "DataBlock", "ResultData", "TestData", "ReportOptions", "ReportData",
]
