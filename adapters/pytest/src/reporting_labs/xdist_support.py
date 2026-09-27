"""pytest-xdist support.

Workers run the tests and attach their data to each TestReport (`rl_payload`). xdist
sends reports to the controller with every attribute, so the controller sees the same
reports as a normal run. Only the controller builds and writes the report.
"""
from __future__ import annotations

from typing import Any, List, Set

import pytest

from .collector import Collector


def is_worker(config: pytest.Config) -> bool:
    return hasattr(config, "workerinput")


class XdistController:
    def __init__(self, collector: Collector) -> None:
        self.collector = collector
        self.nodes: Set[str] = set()

    @pytest.hookimpl(optionalhook=True)
    def pytest_xdist_node_collection_finished(self, node: Any, ids: List[str]) -> None:
        # Every worker collects the whole suite. Record the ids once so tests that never ran still show up.
        self.nodes.add(getattr(getattr(node, "gateway", None), "id", str(id(node))))
        self.collector.workers = max(self.collector.workers, len(self.nodes))
        for nodeid in ids:
            self.collector.add_collected(nodeid)


def register(config: pytest.Config, collector: Collector) -> None:
    if config.pluginmanager.hasplugin("xdist"):
        config.pluginmanager.register(XdistController(collector), "reporting_labs_xdist")
