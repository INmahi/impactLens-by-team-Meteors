"""Data contract validator: schemas (rule 1) and cross-file rules 2-9.

The rules are listed in packages/contract/README.md. Every problem is collected;
nothing stops at the first one. Files that fail their schema are left out of
the cross-file rules (except the synthetic checks of rule 8), so one broken
field does not cascade into dozens of follow-on reports.
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from jsonschema.exceptions import best_match

from . import topology
from .png import read_png
from .schemas import SCHEMA_DIR, load_validators
from .stats_engine import NONFINITE, StatsEngineError, run_analyze

REL_TOL = 1e-9
MAX_SCHEMA_ERRORS = 20
ROOT_FILES = ("variables.json", "regions.json", "regions.topo.json")
STATS_NAME = re.compile(r"^([a-z][a-z0-9]*(?:_[a-z0-9]+)*)__default\.json$")
REPORT_ONLY_KEYS = ("variable", "region", "synthetic")


@dataclass(frozen=True)
class Problem:
    path: str
    rule: int
    message: str

    def __str__(self) -> str:
        return f"{self.path}: rule {self.rule}: {self.message}"


@dataclass
class Result:
    root: Path
    problems: list[Problem] = field(default_factory=list)
    files_checked: int = 0

    @property
    def ok(self) -> bool:
        return not self.problems

    def rules(self) -> set[int]:
        return {p.rule for p in self.problems}

    def summary(self) -> str:
        return f"{self.files_checked} files checked, {len(self.problems)} problems"


class _NonFiniteError(ValueError):
    pass


def _reject_constant(name: str) -> Any:
    raise _NonFiniteError(f"{name} is not allowed in JSON (use null for a missing value)")


def _short(text: str, limit: int = 200) -> str:
    text = " ".join(str(text).split())
    return text if len(text) <= limit else text[: limit - 3] + "..."


def _fmt(items: Any, limit: int = 6) -> str:
    items = sorted(items, key=str)
    shown = ", ".join(str(i) for i in items[:limit])
    return shown + (f" (+{len(items) - limit} more)" if len(items) > limit else "")


def _is_num(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def date_freq(d: str) -> str:
    return "monthly" if "-" in d else "annual"


def date_index(d: str) -> int:
    """Months since year 0 for YYYY-MM, years for YYYY."""
    if "-" in d:
        y, m = d.split("-")
        return int(y) * 12 + int(m) - 1
    return int(d)


def next_date(d: str) -> str:
    if "-" in d:
        i = date_index(d) + 1
        return f"{i // 12:04d}-{i % 12 + 1:02d}"
    return f"{int(d) + 1:04d}"


class Validator:
    def __init__(self, root: Path, stats_check: bool = True, display_root: str | None = None,
                 schema_dir: Path = SCHEMA_DIR) -> None:
        self.root = Path(root)
        self.display_root = (display_root if display_root is not None else str(root)).replace("\\", "/").rstrip("/")
        self.stats_check = stats_check
        self.schema_dir = schema_dir
        self.result = Result(self.root)
        self.raw: dict[str, Any] = {}          # rel path -> parsed JSON (even if schema-invalid)
        self.valid: dict[str, Any] = {}        # rel path -> parsed JSON that passed its schema
        self.present: set[str] = set()         # rel paths of every file found
        self.variables: dict[str, dict] = {}   # valid entries by id
        self.regions: dict[str, dict] = {}
        self.bad_variable_ids: set[str] = set()  # ids of entries that failed the schema
        self.bad_region_ids: set[str] = set()
        self.layer_ids: set[str] = set()       # folders with a manifest.json
        self.series: dict[tuple[str, str], tuple[str, dict]] = {}  # (variable folder, region) -> (rel, doc)
        self.stats: dict[tuple[str, str], tuple[str, dict]] = {}
        self.series_ok: set[tuple[str, str]] = set()  # series whose arrays line up (safe for analyzeTrend)

    # ------------------------------------------------------------------ utils
    def add(self, rel: str, rule: int, message: str) -> None:
        path = f"{self.display_root}/{rel}" if rel else self.display_root
        self.result.problems.append(Problem(path, rule, message))

    def _load(self, rel: str, kind: str | None, nan_rule: int = 1) -> Any:
        """Read, parse and schema-check one JSON file. Returns the doc if it parsed."""
        path = self.root / rel
        self.present.add(rel)
        self.result.files_checked += 1
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            self.add(rel, 1, f"cannot read file as UTF-8: {exc}")
            return None
        try:
            doc = json.loads(text, parse_constant=_reject_constant)
        except _NonFiniteError as exc:
            self.add(rel, nan_rule, str(exc))
            return None
        except json.JSONDecodeError as exc:
            self.add(rel, 1, f"invalid JSON: {exc}")
            return None
        self.raw[rel] = doc
        if kind is None:
            return doc
        errors = sorted(self.validators[kind].iter_errors(doc), key=lambda e: [str(p) for p in e.absolute_path])
        bad_items: set[int] = set()
        whole_bad = False
        for n, err in enumerate(errors):
            path_parts = list(err.absolute_path)
            if path_parts and isinstance(path_parts[0], int) and isinstance(doc, list):
                bad_items.add(path_parts[0])
            else:
                whole_bad = True
            if n >= MAX_SCHEMA_ERRORS:
                continue
            shown = best_match(err.context) if err.context else err
            pointer = "/" + "/".join(str(p) for p in shown.absolute_path)
            self.add(rel, 1, f"schema ({kind}) at {pointer}: {_short(shown.message)}")
        if len(errors) > MAX_SCHEMA_ERRORS:
            self.add(rel, 1, f"... and {len(errors) - MAX_SCHEMA_ERRORS} more schema errors")
        if not errors:
            self.valid[rel] = doc
            self._bad_items = []
        elif isinstance(doc, list) and not whole_bad:
            # Array files: keep the valid entries, remember the bad ones.
            self.valid[rel] = [item for i, item in enumerate(doc) if i not in bad_items]
            self._bad_items = [doc[i] for i in sorted(bad_items)]
        else:
            self._bad_items = list(doc) if isinstance(doc, list) else []
        return doc

    # ------------------------------------------------------------------- main
    def run(self) -> Result:
        if not self.root.exists():
            self.add("", 3, "data directory does not exist; build it first "
                     "(uv run python -m pipeline build --synthetic)")
            return self.result
        if not self.root.is_dir():
            self.add("", 3, "is not a directory")
            return self.result
        if not any(p for p in self.root.iterdir() if not p.name.startswith(".")):
            self.add("", 3, "data directory is empty; build it first "
                     "(uv run python -m pipeline build --synthetic)")
            return self.result
        try:
            self.validators = load_validators(self.schema_dir)
        except Exception as exc:  # noqa: BLE001 - report, never traceback
            self.add("", 1, f"cannot load the contract schemas from {self.schema_dir}: {exc}")
            return self.result

        self._load_root_files()
        self._walk_folders()
        steps = [
            (2, self._rule2), (3, self._rule3), (4, self._rule4_5), (6, self._rule6),
            (7, self._rule7), (8, self._rule8), (9, self._rule9),
        ]
        for rule, step in steps:
            try:
                step()
            except Exception as exc:  # noqa: BLE001 - a validator bug must not hide other problems
                self.add("", rule, f"internal validator error while checking rule {rule}: {exc!r}")
        return self.result

    # ------------------------------------------------------------ discovery
    def _load_root_files(self) -> None:
        for name in ROOT_FILES:
            if not (self.root / name).is_file():
                self.add(name, 3, "required file is missing")
        for name, kind, store, bad in (
            ("variables.json", "variables", self.variables, self.bad_variable_ids),
            ("regions.json", "regions", self.regions, self.bad_region_ids),
        ):
            if not (self.root / name).is_file():
                continue
            self._bad_items = []
            self._load(name, kind)
            for item in self._bad_items:
                if isinstance(item, dict) and isinstance(item.get("id"), str):
                    bad.add(item["id"])
            seen: set[str] = set()
            for item in self.valid.get(name, []):
                if item["id"] in seen:
                    self.add(name, 2, f"duplicate id {item['id']!r}")
                    continue
                seen.add(item["id"])
                store[item["id"]] = item
        if (self.root / "regions.topo.json").is_file():
            self._load("regions.topo.json", "topology")
        for p in sorted(self.root.iterdir()):
            if p.is_file() and p.name not in ROOT_FILES and not p.name.startswith("."):
                self.present.add(p.name)
                self.add(p.name, 3, "unexpected file in the data root")

    def _walk_folders(self) -> None:
        # From every entry, valid or not, so a broken entry does not cascade into rule 3 reports.
        raw_vars = self.raw.get("variables.json")
        outline_paths = {
            v["outlines"] for v in (raw_vars if isinstance(raw_vars, list) else [])
            if isinstance(v, dict) and isinstance(v.get("outlines"), str)
        }
        for folder in sorted(p for p in self.root.iterdir() if p.is_dir() and not p.name.startswith(".")):
            name = folder.name
            if (folder / "manifest.json").is_file():
                self.layer_ids.add(name)
            for item in sorted(folder.iterdir()):
                rel = f"{name}/{item.name}"
                if item.name.startswith("."):
                    continue
                if item.is_dir() and item.name == "series":
                    for f in sorted(item.iterdir()):
                        frel = f"{rel}/{f.name}"
                        if f.is_file() and f.suffix == ".json":
                            doc = self._load(frel, "series", nan_rule=4)
                            if frel in self.valid:
                                self.series[(name, f.stem)] = (frel, doc)
                            else:
                                self.series.setdefault((name, f.stem), (frel, None))  # type: ignore[arg-type]
                        elif not f.name.startswith("."):
                            self.present.add(frel)
                            self.add(frel, 3, "unexpected file in series/ (only {region}.json)")
                elif item.is_dir() and item.name == "stats":
                    for f in sorted(item.iterdir()):
                        frel = f"{rel}/{f.name}"
                        m = STATS_NAME.match(f.name) if f.is_file() else None
                        if m:
                            doc = self._load(frel, "stats")
                            self.stats[(name, m.group(1))] = (frel, doc if frel in self.valid else None)  # type: ignore[assignment]
                        elif not f.name.startswith("."):
                            self.present.add(frel)
                            self.add(frel, 3, "unexpected file in stats/ (only {region}__default.json)")
                elif item.is_dir() and item.name == "frames":
                    for f in sorted(item.iterdir()):
                        self.present.add(f"{rel}/{f.name}")
                elif item.is_file() and item.name == "manifest.json":
                    self._load(rel, "manifest")
                elif item.is_file() and item.name == "colormap.png":
                    self.present.add(rel)
                elif item.is_file() and item.name == "outlines.topo.json":
                    self._load(rel, "topology")
                    if rel not in outline_paths:
                        self.add(rel, 3, "outlines file is not referenced by any variable's 'outlines'")
                else:
                    self.present.add(rel)
                    self.add(rel, 3, "unexpected file or folder")

    def _series_and_stats(self) -> list[tuple[tuple[str, str], tuple[str, Any]]]:
        """Every series and stats file as ((folder, region), (rel, doc)); both kept for the same pair."""
        items = list(self.series.items()) + list(self.stats.items())
        return sorted(items, key=lambda kv: (kv[0], kv[1][0]))

    def _known_variable(self, vid: str) -> bool:
        return vid in self.variables or vid in self.bad_variable_ids

    def _known_region(self, rid: str) -> bool:
        return rid in self.regions or rid in self.bad_region_ids

    def _region_topo_geometries(self) -> list[dict] | None:
        topo = self.valid.get("regions.topo.json")
        if topo is None or "regions" not in topo["objects"]:
            return None
        return topo["objects"]["regions"]["geometries"]

    # ---------------------------------------------------------------- rule 2
    def _rule2(self) -> None:
        for vid, v in self.variables.items():
            for rid in v["regions"]:
                if not self._known_region(rid):
                    self.add("variables.json", 2, f"{vid}: region {rid!r} is not in regions.json")
            if set(v["periods"]) != set(v["regions"]):
                diff = set(v["periods"]) ^ set(v["regions"])
                self.add("variables.json", 2, f"{vid}: periods keys must equal regions (differ in {_fmt(diff)})")
            for rid in v["periods"]:
                if rid not in v["regions"] and not self._known_region(rid):
                    self.add("variables.json", 2, f"{vid}: periods region {rid!r} is not in regions.json")
            if "variantOf" in v:
                target = v["variantOf"]
                if target == vid:
                    self.add("variables.json", 2, f"{vid}: variantOf points to itself")
                elif not self._known_variable(target):
                    self.add("variables.json", 2, f"{vid}: variantOf {target!r} is not in variables.json")
        for rid, r in self.regions.items():
            for vid in r["variables"]:
                if not self._known_variable(vid):
                    self.add("regions.json", 2, f"{rid}: variable {vid!r} is not in variables.json")
            parent = r["parent"]
            if parent is not None:
                if parent == rid:
                    self.add("regions.json", 2, f"{rid}: parent points to itself")
                elif not self._known_region(parent):
                    self.add("regions.json", 2, f"{rid}: parent {parent!r} is not in regions.json")
            expected = {vid for vid, v in self.variables.items() if rid in v["regions"]}
            listed = set(r["variables"])
            missing = expected - listed
            extra = {vid for vid in listed - expected if vid in self.variables}
            if missing:
                self.add("regions.json", 2, f"{rid}: variables is missing {_fmt(missing)} "
                         "(they list this region in variables.json)")
            if extra:
                self.add("regions.json", 2, f"{rid}: variables lists {_fmt(extra)}, "
                         "but their variables.json regions do not include this region")
        geoms = self._region_topo_geometries()
        if geoms is not None:
            for g in geoms:
                gid = g.get("id")
                if isinstance(gid, str) and not self._known_region(gid):
                    self.add("regions.topo.json", 2, f"geometry id {gid!r} is not in regions.json")
        for layer in sorted(self.layer_ids):
            rel = f"{layer}/manifest.json"
            m = self.valid.get(rel)
            if m is not None and m["variable"] != layer:
                self.add(rel, 2, f"variable is {m['variable']!r}, expected the folder name {layer!r}")
        for vid, v in self.variables.items():
            rel = v.get("outlines")
            topo = self.valid.get(rel) if rel else None
            if topo is None or "outlines" not in topo["objects"]:
                continue
            for i, g in enumerate(topo["objects"]["outlines"]["geometries"]):
                reg = (g.get("properties") or {}).get("region")
                if isinstance(reg, str) and reg not in v["regions"]:
                    self.add(rel, 2, f"geometry {i}: region {reg!r} is not in {vid}'s regions")

    # ---------------------------------------------------------------- rule 3
    def _rule3(self) -> None:
        for vid, v in self.variables.items():
            for rid in v["regions"]:
                if not self._known_region(rid):
                    continue
                for rel in (f"{vid}/series/{rid}.json", f"{vid}/stats/{rid}__default.json"):
                    if rel not in self.present:
                        self.add(rel, 3, f"missing: {vid} is declared for region {rid}")
            mode = v["mapMode"]
            if mode is not None:
                for rel in (f"{mode}/manifest.json", f"{mode}/colormap.png"):
                    if rel not in self.present:
                        self.add(rel, 3, f"missing: mapMode of {vid} is {mode!r}")
            if "outlines" in v and v["outlines"] not in self.present:
                self.add(v["outlines"], 3, f"missing: referenced by {vid}'s outlines")
        # Undeclared pairs and stray folders.
        mapmodes = {v["mapMode"] for v in self.variables.values() if v["mapMode"] is not None}
        for (folder, rid), (rel, _doc) in self._series_and_stats():
            if folder in self.bad_variable_ids:
                continue
            v = self.variables.get(folder)
            if v is None:
                self.add(rel, 3, f"{folder!r} is not a variable in variables.json, so it has no series or stats")
            elif rid not in v["regions"]:
                self.add(rel, 3, f"region {rid!r} is not declared for {folder} in variables.json")
        for folder in sorted(p.name for p in self.root.iterdir() if p.is_dir() and not p.name.startswith(".")):
            if folder in self.variables or folder in self.bad_variable_ids or folder in mapmodes:
                continue
            if folder in self.layer_ids:
                self.add(f"{folder}/manifest.json", 3, f"layer {folder!r} is not the mapMode of any variable")
            else:
                self.add(folder, 3, "folder is not a variable in variables.json nor a mapMode layer")
        # Region outlines.
        geoms = self._region_topo_geometries()
        if geoms is not None:
            ids = {g.get("id") for g in geoms}
            for rid, r in self.regions.items():
                is_global = r.get("kind") == "global"
                if not is_global and rid not in ids:
                    self.add("regions.topo.json", 3, f"no geometry for region {rid!r}")
                if is_global and rid in ids:
                    self.add("regions.topo.json", 3, f"global region {rid!r} must not have a geometry")

    # ------------------------------------------------------------- rules 4, 5
    def _rule4_5(self) -> None:
        for vid, v in self.variables.items():
            freq = v["frequency"]
            spans = [("period", v["period"])] + [(f"periods.{k}", p) for k, p in v["periods"].items()]
            if "baseline" in v:
                # The contract does not say which date format a baseline uses; check order only.
                b0, b1 = v["baseline"]
                if (int(b0[:4]), b0[5:] or "01") > (int(b1[:4]), b1[5:] or "12"):
                    self.add("variables.json", 4, f"{vid}: baseline starts after it ends: {[b0, b1]}")
            fmt_ok = True
            for label, (a, b) in spans:
                if date_freq(a) != freq or date_freq(b) != freq:
                    self.add("variables.json", 4, f"{vid}: {label} {[a, b]} does not use the {freq} date format")
                    fmt_ok = False
                elif a > b:
                    self.add("variables.json", 4, f"{vid}: {label} starts after it ends: {[a, b]}")
            if fmt_ok and v["periods"]:
                true_span = [min(p[0] for p in v["periods"].values()), max(p[1] for p in v["periods"].values())]
                if list(v["period"]) != true_span:
                    self.add("variables.json", 5, f"{vid}: period {v['period']} must be the true span of "
                             f"periods, {true_span}")

        for (folder, rid), (rel, s) in sorted(self.series.items()):
            if s is None:
                continue
            self._check_series(folder, rid, rel, s)

    def _check_series(self, folder: str, rid: str, rel: str, s: dict) -> None:
        if s["variable"] != folder:
            self.add(rel, 4, f"variable is {s['variable']!r}, expected the folder name {folder!r}")
        if s["region"] != rid:
            self.add(rel, 4, f"region is {s['region']!r}, expected the file name {rid!r}")
        v = self.variables.get(folder)
        if v is not None:
            for key in ("units", "frequency", "kind"):
                if s[key] != v[key]:
                    self.add(rel, 4, f"{key} is {s[key]!r}, variables.json says {v[key]!r}")
        dates, values = s["dates"], s["values"]
        n = len(dates)
        lengths_ok = True
        for key in ("values", "sigma", "lower", "upper"):
            if key in s and len(s[key]) != n:
                self.add(rel, 4, f"{key} has {len(s[key])} entries, dates has {n}")
                lengths_ok = False
        # Regular grid (the schema already checked the date format and uniqueness).
        idx = [date_index(d) for d in dates]
        grid_ok = True
        for i in range(1, n):
            if idx[i] <= idx[i - 1]:
                self.add(rel, 4, f"dates are not ascending: {dates[i - 1]} then {dates[i]}")
                grid_ok = False
                break
            if idx[i] != idx[i - 1] + 1:
                self.add(rel, 4, f"dates skip from {dates[i - 1]} to {dates[i]}; keep every date "
                         "and write null for missing values")
                grid_ok = False
                break
        if lengths_ok:
            self.series_ok.add((folder, rid))
        if not lengths_ok:
            return
        present = [i for i, x in enumerate(values) if x is not None]
        if not present:
            self.add(rel, 4, "every value is null")
        elif v is not None and rid in v["periods"]:
            first, last = dates[present[0]], dates[present[-1]]
            want = list(v["periods"][rid])
            if [first, last] != want:
                self.add(rel, 4, f"first and last non-null dates are {[first, last]}, "
                         f"periods[{rid}] in variables.json says {want}")
        # Rule 5: never padded.
        if present:
            lead, trail = present[0], n - 1 - present[-1]
            if lead:
                self.add(rel, 5, f"{lead} leading null value(s) before {dates[present[0]]}; the series is padded")
            if trail:
                self.add(rel, 5, f"{trail} trailing null value(s) after {dates[present[-1]]}; the series is padded")
        # Bounds and sigma.
        if "sigma" in s:
            neg = [dates[i] for i, x in enumerate(s["sigma"]) if x is not None and x < 0]
            if neg:
                self.add(rel, 4, f"sigma is negative at {_fmt(neg)}")
        if "lower" in s and "upper" in s:
            lo, hi = s["lower"], s["upper"]
            bad = []
            for i in range(n):
                trio = (lo[i], values[i], hi[i])
                if lo[i] is not None and hi[i] is not None and lo[i] > hi[i]:
                    bad.append(dates[i])
                elif all(x is not None for x in trio) and not (lo[i] <= values[i] <= hi[i]):
                    bad.append(dates[i])
            if bad:
                self.add(rel, 4, f"lower <= value <= upper fails at {_fmt(bad)}")
        # Segments: in order, contiguous, covering dates[0]..dates[-1].
        segs = s["segments"]
        freq = s["frequency"]
        if any(date_freq(g["start"]) != freq or date_freq(g["end"]) != freq for g in segs):
            self.add(rel, 4, f"segment dates must use the {freq} date format")
            return
        for g in segs:
            if g["start"] > g["end"]:
                self.add(rel, 4, f"segment {g['source']!r} starts after it ends")
                return
        if grid_ok and n:
            if segs[0]["start"] != dates[0] or segs[-1]["end"] != dates[-1]:
                self.add(rel, 4, f"segments span {segs[0]['start']}..{segs[-1]['end']}, "
                         f"dates span {dates[0]}..{dates[-1]}; segments must cover the dates")
        for a, b in zip(segs, segs[1:]):
            if b["start"] <= a["end"]:
                self.add(rel, 4, f"segments overlap or are out of order: {a['source']!r} ends {a['end']}, "
                         f"{b['source']!r} starts {b['start']}")
            elif b["start"] != next_date(a["end"]):
                self.add(rel, 4, f"segments leave a hole between {a['end']} and {b['start']}")

    # ---------------------------------------------------------------- rule 6
    def _rule6(self) -> None:
        jobs: list[tuple[str, dict, dict]] = []
        for (folder, rid), (rel, st) in sorted(self.stats.items()):
            if st is None:
                continue
            if st["variable"] != folder:
                self.add(rel, 6, f"variable is {st['variable']!r}, expected the folder name {folder!r}")
            if st["region"] != rid:
                self.add(rel, 6, f"region is {st['region']!r}, expected {rid!r} from the file name")
            entry = self.series.get((folder, rid))
            if entry is None or entry[1] is None or (folder, rid) not in self.series_ok:
                continue  # missing or broken series is reported elsewhere
            s = entry[1]
            for key in ("synthetic", "frequency", "kind"):
                if st[key] != s[key]:
                    self.add(rel, 6, f"{key} is {st[key]!r}, the series says {s[key]!r}")
            d0, d1 = s["dates"][0], s["dates"][-1]
            if not (d0 <= st["start"] <= st["end"] <= d1):
                self.add(rel, 6, f"start/end {st['start']}..{st['end']} are not within the series {d0}..{d1}")
            if any(x is not None for x in s["values"]):
                jobs.append((rel, st, s))
        if not self.stats_check or not jobs:
            return
        inputs = [{"dates": s["dates"], "values": s["values"], "frequency": s["frequency"], "kind": s["kind"]}
                  for _rel, _st, s in jobs]
        try:
            results = run_analyze(inputs)
        except StatsEngineError as exc:
            self.add("", 6, f"cannot recompute stats: {exc} (use --no-stats-check to skip rule 6 parity)")
            return
        for (rel, st, _s), res in zip(jobs, results):
            if not res.get("ok"):
                self.add(rel, 6, f"analyzeTrend() failed on the series: {res.get('error')}")
                continue
            actual = {k: val for k, val in st.items() if k not in REPORT_ONLY_KEYS}
            diffs: list[str] = []
            _compare(res["report"], actual, "", diffs)
            for d in diffs[:10]:
                self.add(rel, 6, f"differs from a fresh analyzeTrend() run: {d}")
            if len(diffs) > 10:
                self.add(rel, 6, f"... and {len(diffs) - 10} more differences")

    # ---------------------------------------------------------------- rule 7
    def _rule7(self) -> None:
        for layer in sorted(self.layer_ids):
            rel = f"{layer}/manifest.json"
            m = self.valid.get(rel)
            if m is not None:
                self._check_manifest(layer, rel, m)
            cmap = f"{layer}/colormap.png"
            if cmap in self.present:
                self._check_png(cmap, 256, 1, "colormap.png must be 256x1")

    def _check_manifest(self, layer: str, rel: str, m: dict) -> None:
        frames, atlases, grid = m["frames"], m["atlases"], m["grid"]
        dates = [f["date"] for f in frames]
        freqs = {date_freq(d) for d in dates} | {date_freq(d) for d in m["missing"]}
        if len(freqs) > 1:
            self.add(rel, 7, "frame and missing dates mix YYYY-MM and YYYY")
        else:
            for a, b in zip(dates, dates[1:]):
                if b <= a:
                    self.add(rel, 7, f"frames are not sorted by date with unique dates: {a} then {b}")
                    break
            clash = set(m["missing"]) & set(dates)
            if clash:
                self.add(rel, 7, f"missing dates have a frame: {_fmt(clash)}")
            outside = [d for d in m["missing"] if dates and not (dates[0] <= d <= dates[-1])]
            if outside:
                self.add(rel, 7, f"missing dates outside the frame span {dates[0]}..{dates[-1]}: {_fmt(outside)}")
        lo, hi = m["valueRange"]
        if not lo < hi:
            self.add(rel, 7, f"valueRange {m['valueRange']} must be [min, max] with min < max")
        files = [a["file"] for a in atlases]
        if len(set(files)) != len(files):
            self.add(rel, 7, "atlases lists the same file twice")
        by_atlas: dict[int, list[tuple[int, dict]]] = {}
        for i, f in enumerate(frames):
            where = f"frame {i} ({f['date']})"
            if f["w"] != grid["width"] or f["h"] != grid["height"]:
                self.add(rel, 7, f"{where}: size {f['w']}x{f['h']} must equal grid {grid['width']}x{grid['height']}")
            if f["atlas"] >= len(atlases):
                self.add(rel, 7, f"{where}: atlas {f['atlas']} does not exist ({len(atlases)} atlases)")
                continue
            a = atlases[f["atlas"]]
            if f["x"] + f["w"] > a["width"] or f["y"] + f["h"] > a["height"]:
                self.add(rel, 7, f"{where}: rectangle x={f['x']} y={f['y']} {f['w']}x{f['h']} "
                         f"lies outside atlas {a['width']}x{a['height']}")
            by_atlas.setdefault(f["atlas"], []).append((i, f))
        for ai, items in by_atlas.items():
            items.sort(key=lambda t: (t[1]["x"], t[1]["y"]))
            reported = 0
            for j, (i, f) in enumerate(items):
                for i2, g in items[j + 1:]:
                    if g["x"] >= f["x"] + f["w"]:
                        break
                    if g["y"] < f["y"] + f["h"] and f["y"] < g["y"] + g["h"]:
                        if reported < 5:
                            self.add(rel, 7, f"frames {f['date']} and {g['date']} overlap in atlas {ai}")
                        reported += 1
        for a in atlases:
            arel = f"{layer}/{a['file']}"
            if arel not in self.present:
                self.add(arel, 7, "atlas listed in manifest.json does not exist")
            else:
                self._check_png(arel, a["width"], a["height"], "size must match atlases in manifest.json")
        listed = {f"{layer}/{a['file']}" for a in atlases}
        for p in sorted(self.present):
            if p.startswith(f"{layer}/frames/") and p not in listed:
                self.add(p, 3, "file in frames/ is not listed in manifest.json atlases")

    def _check_png(self, rel: str, width: int, height: int, size_msg: str) -> None:
        self.result.files_checked += 1
        try:
            info = read_png(self.root / rel)
        except Exception as exc:  # noqa: BLE001
            self.add(rel, 7, f"cannot read PNG: {exc}")
            return
        if info.colour_type != 6 or info.bit_depth != 8 or info.pil_mode != "RGBA":
            self.add(rel, 7, f"must be 8-bit RGBA, found {info.bit_depth}-bit {info.colour_name}")
        if (info.width, info.height) != (width, height):
            self.add(rel, 7, f"is {info.width}x{info.height}; {size_msg} ({width}x{height})")
        if info.colour_chunks:
            self.add(rel, 7, f"has colour chunks {', '.join(info.colour_chunks)}; save without a colour "
                     "profile or gamma so browsers do not alter the packed values")

    # ---------------------------------------------------------------- rule 8
    def _rule8(self) -> None:
        for rel, doc in sorted(self.raw.items()):
            if "/series/" in rel and isinstance(doc, dict) and "injected" in doc and doc.get("synthetic") is not True:
                self.add(rel, 8, "injected is only allowed when synthetic is true")
        for vid, v in self.variables.items():
            want = v["synthetic"]
            rels = [r for (folder, _rid), (r, _d) in self._series_and_stats() if folder == vid]
            for layer in {vid, v["mapMode"]} - {None}:
                if layer in self.layer_ids:
                    rels.append(f"{layer}/manifest.json")
            for rel in sorted(set(rels)):
                doc = self.raw.get(rel)
                if isinstance(doc, dict) and isinstance(doc.get("synthetic"), bool) and doc["synthetic"] != want:
                    self.add(rel, 8, f"synthetic is {str(doc['synthetic']).lower()}, but variables.json says "
                             f"{str(want).lower()} for {vid}")

    # ---------------------------------------------------------------- rule 9
    def _rule9(self) -> None:
        topo = self.valid.get("regions.topo.json")
        if topo is not None:
            if "regions" not in topo["objects"]:
                self.add("regions.topo.json", 9, f"needs an object named 'regions' (found {_fmt(topo['objects'])})")
            self._check_topo_geometry("regions.topo.json", topo, "regions")
        for vid, v in self.variables.items():
            rel = v.get("outlines")
            topo = self.valid.get(rel) if rel else None
            if topo is None:
                continue
            if "outlines" not in topo["objects"]:
                self.add(rel, 9, f"needs an object named 'outlines' (found {_fmt(topo['objects'])})")
            self._check_topo_geometry(rel, topo, "outlines")

    def _check_topo_geometry(self, rel: str, topo: dict, object_name: str) -> None:
        arcs, problems = topology.decode_arcs(topo)
        for p in problems:
            self.add(rel, 9, p)
        obj = topo["objects"].get(object_name)
        if obj is None:
            return
        seen: set[str] = set()
        for i, g in enumerate(obj["geometries"]):
            label = f"{object_name} geometry {i}"
            if object_name == "regions":
                gid = g.get("id")
                if gid is None:
                    self.add(rel, 9, f"{label}: needs an id equal to its region id")
                elif gid in seen:
                    self.add(rel, 9, f"{label}: duplicate id {gid!r}")
                else:
                    seen.add(gid)
                    label = f"geometry {gid!r}"
            else:
                props = g.get("properties") or {}
                for key in ("region", "date"):
                    if key not in props:
                        self.add(rel, 9, f"{label}: properties.{key} is required")
            for p in topology.check_geometry(g, arcs, label):
                self.add(rel, 9, p)


def _compare(expected: Any, actual: Any, path: str, diffs: list[str]) -> None:
    """Compare an engine report with a stats file: numbers to REL_TOL, the rest exactly."""
    where = path or "(report)"
    if isinstance(expected, dict):
        if not isinstance(actual, dict):
            diffs.append(f"{where}: expected an object")
            return
        for k in sorted(set(expected) | set(actual)):
            sub = f"{path}.{k}" if path else k
            if k not in actual:
                diffs.append(f"{sub}: missing (engine gives {_short(json.dumps(expected[k]), 80)})")
            elif k not in expected:
                diffs.append(f"{sub}: not in the engine report")
            else:
                _compare(expected[k], actual[k], sub, diffs)
    elif isinstance(expected, list):
        if path == "notes" or path.endswith(".notes"):
            if expected != actual:
                diffs.append(f"notes: expected {_short(json.dumps(expected), 160)}")
            return
        if not isinstance(actual, list) or len(actual) != len(expected):
            diffs.append(f"{where}: expected a list of {len(expected)}")
            return
        for i, (e, a) in enumerate(zip(expected, actual)):
            _compare(e, a, f"{path}[{i}]", diffs)
    elif isinstance(expected, str) and expected in NONFINITE and path not in ("start", "end"):
        diffs.append(f"{where}: engine gives {expected}, which JSON cannot store; the series needs fixing")
    elif isinstance(expected, bool) or isinstance(actual, bool) or isinstance(expected, str) or expected is None:
        if expected != actual or type(expected) is not type(actual):
            diffs.append(f"{where}: {json.dumps(actual)} != engine {json.dumps(expected)}")
    elif _is_num(expected):
        if not _is_num(actual) or not math.isclose(expected, actual, rel_tol=REL_TOL):
            diffs.append(f"{where}: {json.dumps(actual)} != engine {json.dumps(expected)}")
    elif expected != actual:
        diffs.append(f"{where}: {json.dumps(actual)} != engine {json.dumps(expected)}")


def validate(root: Path | str, stats_check: bool = True, display_root: str | None = None) -> Result:
    """Validate a data/public tree. Never raises for bad data; returns every problem."""
    return Validator(Path(root), stats_check=stats_check, display_root=display_root).run()
