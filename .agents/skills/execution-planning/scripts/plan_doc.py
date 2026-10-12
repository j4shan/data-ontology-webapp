#!/usr/bin/env python3
"""Parse an execution plan written to the plan document contract.

The parser reads the document and reports what it found. It makes no judgement
about whether the plan is correct; `check_plan.py` does that.

A plan is markdown with `##` sections, GitHub-flavored tables, and one
`### T<n> <id>` subsection per task under `## Tasks`. Every structure this
module returns carries the 1-based line it started on, so a caller can point a
reader at the offending line.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field

TASK_HEADING = re.compile(r"^###\s+(T\d+)\s+(\S.*?)\s*$")
FIELD_LABEL = re.compile(r"^\*\*(Files|Consumes|Produces|Verify)\*\*\s*$")
PLACEHOLDER = re.compile(r"<[^<>]+>")
SCAFFOLD_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
TASK_LABEL = re.compile(r"^T(\d+)$")


@dataclass
class Table:
    headers: list[str]
    rows: list[dict[str, str]]
    line: int
    row_lines: list[int] = field(default_factory=list)

    def column(self, name: str) -> list[str]:
        return [row.get(name, "") for row in self.rows]


@dataclass
class TaskBody:
    label: str
    id: str
    line: int
    fields: dict[str, list[str]] = field(default_factory=dict)


@dataclass
class Section:
    title: str
    level: int
    start: int
    end: int


@dataclass
class PlanDoc:
    lines: list[str]
    sections: list[Section]
    tables: dict[str, list[Table]]
    task_bodies: list[TaskBody]

    def section(self, title: str) -> Section | None:
        for sec in self.sections:
            if sec.title == title:
                return sec
        return None

    def table_with_headers(self, title: str, headers: list[str]) -> Table | None:
        """Return the first table in `title` whose headers match exactly."""
        for table in self.tables.get(title, []):
            if table.headers == headers:
                return table
        return None

    def first_table(self, title: str) -> Table | None:
        tables = self.tables.get(title, [])
        return tables[0] if tables else None


def _split_row(raw: str) -> list[str]:
    stripped = raw.strip()
    if stripped.startswith("|"):
        stripped = stripped[1:]
    if stripped.endswith("|"):
        stripped = stripped[:-1]
    return [cell.strip() for cell in stripped.split("|")]


def _is_divider(raw: str) -> bool:
    cells = _split_row(raw)
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells)


def _looks_like_row(raw: str) -> bool:
    return raw.strip().startswith("|") and raw.strip().endswith("|")


def parse_sections(lines: list[str]) -> list[Section]:
    heads: list[Section] = []
    fenced = False
    for i, raw in enumerate(lines):
        if raw.lstrip().startswith("```"):
            fenced = not fenced
            continue
        if fenced:
            continue
        match = re.match(r"^(#{1,6})\s+(\S.*?)\s*$", raw)
        if match:
            heads.append(Section(match.group(2), len(match.group(1)), i + 1, len(lines)))
    for earlier, later in zip(heads, heads[1:]):
        earlier.end = later.start - 1
    return heads


def parse_tables(lines: list[str], start: int, end: int) -> list[Table]:
    """Collect every markdown table whose rows lie within [start, end]."""
    tables: list[Table] = []
    i = start - 1
    while i < end:
        raw = lines[i]
        if _looks_like_row(raw) and i + 1 < end and _is_divider(lines[i + 1]):
            headers = _split_row(raw)
            table = Table(headers=headers, rows=[], line=i + 1)
            j = i + 2
            while j < end and _looks_like_row(lines[j]):
                cells = _split_row(lines[j])
                cells += [""] * (len(headers) - len(cells))
                table.rows.append(dict(zip(headers, cells)))
                table.row_lines.append(j + 1)
                j += 1
            tables.append(table)
            i = j
            continue
        i += 1
    return tables


def parse_task_bodies(lines: list[str], start: int, end: int) -> list[TaskBody]:
    bodies: list[TaskBody] = []
    current: TaskBody | None = None
    label: str | None = None
    for i in range(start - 1, end):
        raw = lines[i]
        heading = TASK_HEADING.match(raw)
        if heading:
            current = TaskBody(label=heading.group(1), id=heading.group(2), line=i + 1)
            bodies.append(current)
            label = None
            continue
        if current is None:
            continue
        field_label = FIELD_LABEL.match(raw)
        if field_label:
            label = field_label.group(1)
            current.fields.setdefault(label, [])
            continue
        if label and raw.strip():
            current.fields[label].append(raw.strip())
    return bodies


def load(path: str) -> PlanDoc:
    if path == "-":
        text = sys.stdin.read()
    else:
        with open(path, encoding="utf-8") as handle:
            text = handle.read()
    lines = text.splitlines()
    sections = parse_sections(lines)

    # A `## Section` runs to the next `##`, not to the next heading of any
    # level, so `## Tasks` keeps its `### T<n>` subsections.
    level2 = [s for s in sections if s.level == 2]
    for earlier, later in zip(level2, level2[1:]):
        earlier.end = later.start - 1
    if level2:
        level2[-1].end = len(lines)

    tables: dict[str, list[Table]] = {}
    for sec in sections:
        if sec.level != 2:
            continue
        tables[sec.title] = parse_tables(lines, sec.start, sec.end)

    tasks_section = next((s for s in sections if s.title == "Tasks" and s.level == 2), None)
    bodies = parse_task_bodies(lines, tasks_section.start, tasks_section.end) if tasks_section else []

    return PlanDoc(lines=lines, sections=sections, tables=tables, task_bodies=bodies)


def task_number(label: str) -> int | None:
    match = TASK_LABEL.match(label.strip())
    return int(match.group(1)) if match else None


def split_refs(cell: str) -> list[str]:
    """Split a `Depends on` or Goals `Tasks` cell into task labels."""
    text = cell.strip()
    if text in {"", "—", "-", "–"}:
        return []
    return [part.strip() for part in text.split(",") if part.strip()]
