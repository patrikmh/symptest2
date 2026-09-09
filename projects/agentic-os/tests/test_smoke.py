"""Smoke test for agentic-os. Replace with real tests."""
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[1]


def test_project_has_readme():
    assert (PROJECT_DIR / "README.md").is_file()


def test_spec_is_v6_2():
    spec = (PROJECT_DIR / "SPEC.md").read_text(encoding="utf-8")
    assert "Canonical Architecture Specification v6.2" in spec
    assert "Dispatch Barrier" in spec
    assert "## 210. Closing product law" in spec
