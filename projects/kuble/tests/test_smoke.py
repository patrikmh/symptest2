"""Monorepo-level smoke checks for the kuble (LOTS) project.

The real test suites are TypeScript (Vitest / Playwright) and run with pnpm inside
this folder. These checks only make sure the Phase 0 artefacts the spec requires
stay present and consistent.
"""
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[1]


def test_project_has_readme():
    assert (PROJECT_DIR / "README.md").is_file()


def test_spec_and_phase0_docs_exist():
    for relative in (
        "LOTS_MVP_SPEC.md",
        "docs/upstream-map.md",
        "docs/implementation-plan.md",
        "docs/brand.md",
        "docs/upstream/README.rakazo.md",
    ):
        assert (PROJECT_DIR / relative).is_file(), relative


def test_upstream_map_records_the_imported_commit():
    text = (PROJECT_DIR / "docs" / "upstream-map.md").read_text(encoding="utf-8")
    assert "git-subtree" in text or "git subtree" in text
    assert "elie222/rakazo" in text


def test_lots_packages_are_workspace_members():
    workspace = (PROJECT_DIR / "pnpm-workspace.yaml").read_text(encoding="utf-8")
    assert '"packages/*"' in workspace
    for pkg in PROJECT_DIR.glob("packages/lots-*"):
        assert (pkg / "package.json").is_file(), pkg
