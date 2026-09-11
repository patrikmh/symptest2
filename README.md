# Monorepo

A single home for small, self-contained code projects. Each project lives in
its own folder under `projects/`, ships with its own README and tests, and does
not depend on any other project.

## Layout

```
.
├── projects/            # One folder per project (the interesting part)
│   └── snake-game/
│       ├── README.md
│       ├── index.html
│       └── tests/
├── templates/
│   └── project/         # Starting point copied by scripts/new-project.sh
├── scripts/
│   └── new-project.sh   # Scaffold a new project folder
├── .github/workflows/   # CI: runs the tests of every project
├── pytest.ini           # Shared pytest configuration
├── requirements-dev.txt # Shared dev tooling (pytest)
├── WORKFLOW.md          # Agent orchestrator configuration
└── README.md
```

## Projects

| Project | Description |
| ------- | ----------- |
| [snake-game](projects/snake-game/) | Single-file HTML5 canvas Snake with power-ups, levels and sound. |
| [grokcall](projects/grokcall/) | AI phone assistant replacing voicemail via Grok Bot, 46elks & ElevenLabs. |
| [kuble](projects/kuble/) | LOTS: persistent multi-agent workspace (agents, Fyrar, approvals, packs) built on a vendored Rakazo fork. |

## Adding a project

```bash
./scripts/new-project.sh my-project
```

This copies `templates/project/` to `projects/my-project/`. Then:

1. Fill in `projects/my-project/README.md`.
2. Put the source next to the README (or in `src/` if it grows).
3. Keep tests in `projects/my-project/tests/`.
4. Add a row to the table above.

## Conventions

- Folder names are `kebab-case`.
- Every project has a `README.md` explaining what it is and how to run it.
- Tests live in `tests/` inside the project and are discovered by the root
  `pytest.ini`, so `pytest` from the repo root runs everything, and
  `pytest projects/<name>` runs a single project.
- Projects are independent. Shared code should be copied or turned into its own
  project rather than imported across folders.
- Project-specific dependencies go in a file inside the project folder
  (`requirements.txt`, `package.json`, ...). `requirements-dev.txt` at the root
  only holds tooling used to run the test suite.

## Running the tests

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest
```
