"""Smoke test for agentic-os. Replace with real tests."""
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[1]


def test_project_has_readme():
    assert (PROJECT_DIR / "README.md").is_file()


def test_spec_is_v7_1():
    spec = (PROJECT_DIR / "SPEC.md").read_text(encoding="utf-8")
    assert "Canonical Architecture Specification v7.1" in spec
    assert "Dispatch Barrier" in spec
    assert "## 182. Closing reachability law" in spec
    assert "Tailscale is a path" in spec


def test_spec_sections_are_contiguous():
    import re

    spec = (PROJECT_DIR / "SPEC.md").read_text(encoding="utf-8")
    numbers = [int(m) for m in re.findall(r"^## (\d+)\. ", spec, re.M)]
    assert numbers == list(range(1, len(numbers) + 1))
    assert f"Sections are numbered 1–{numbers[-1]} with no gaps." in spec
