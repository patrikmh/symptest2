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


def test_v1_gate_count_matches_group_a():
    import re

    spec = (PROJECT_DIR / "SPEC.md").read_text(encoding="utf-8")
    stated = re.findall(r"The V1 test gate is (\d+) tests", spec)
    assert len(stated) == 1
    gate = int(stated[0])

    group_a = re.search(
        r"^## 173\. [^\n]*\n(.*?)^## 174\. ",
        spec,
        re.M | re.S,
    )
    assert group_a is not None
    numbers = [int(n) for n in re.findall(r"^(\d+)\. ", group_a.group(1), re.M)]
    assert numbers == list(range(1, gate + 1))
