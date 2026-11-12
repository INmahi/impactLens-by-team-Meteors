"""Load the contract schemas into a referencing.Registry and build validators."""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlsplit

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_DIR = REPO_ROOT / "packages" / "contract" / "schemas"
ID_BASE = "https://trend-detective.local/contract/"

# Schema file for each kind of data file (packages/contract/README.md table).
SCHEMA_FILES = {
    "variables": "variables.schema.json",
    "regions": "regions.schema.json",
    "topology": "topology.schema.json",
    "series": "series.schema.json",
    "stats": "stats.schema.json",
    "manifest": "manifest.schema.json",
}


def _format_checker() -> FormatChecker:
    checker = FormatChecker()
    if "uri" not in checker.checkers:
        # jsonschema checks "uri" only when rfc3987 is installed. It is not a
        # project dependency, so fall back to a stdlib check: absolute URI with
        # a scheme, and a host for http(s).
        @checker.checks("uri")
        def _is_uri(value: object) -> bool:
            if not isinstance(value, str):
                return True
            if any(c.isspace() for c in value):
                return False
            parts = urlsplit(value)
            if not parts.scheme:
                return False
            if parts.scheme in ("http", "https") and not parts.netloc:
                return False
            return True

    return checker


def load_validators(schema_dir: Path = SCHEMA_DIR) -> dict[str, Draft202012Validator]:
    """One validator per file kind, with every schema registered by its $id."""
    resources = []
    by_file: dict[str, dict] = {}
    for path in sorted(schema_dir.glob("*.schema.json")):
        schema = json.loads(path.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
        by_file[path.name] = schema
        resources.append((schema["$id"], Resource.from_contents(schema)))
    registry = Registry().with_resources(resources)
    checker = _format_checker()
    validators = {}
    for kind, name in SCHEMA_FILES.items():
        if name not in by_file:
            raise FileNotFoundError(f"schema {name} not found in {schema_dir}")
        validators[kind] = Draft202012Validator(by_file[name], registry=registry, format_checker=checker)
    return validators
