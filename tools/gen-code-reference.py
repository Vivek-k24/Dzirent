#!/usr/bin/env python3
"""Regenerates pranalika/code-reference.md (C5).

An index of the repo's source: every source file with its line count and its declarations,
grouped by language, in the format of the original file (C4 level 4):

  ### `path` (N lines)
  - L12: `the declaration line`

Rules (fitted to the original file):
- Kotlin (mobile/, not iosApp): `class`, `object`, `interface`, `fun`, `val`, `var`, `typealias`
  declarations indented at most 4 spaces, outside a constructor's parentheses, not private, not a
  companion object, and not a constructor parameter (a line ending with a comma).
- TypeScript / TSX (supabase/functions, apps/web): exported declarations at the start of a line.
- Python (services/vision, supabase/tests): `def` / `class` at the start of a line, and `@app.`
  route decorators.
- SQL (supabase/migrations): statements at the start of a line that create, alter, grant, revoke,
  drop or comment (not publication or default-privilege changes). Data-only migrations are left out.
- Generated files (the error-code copies) are left out; lines are cut at 170 characters.

Files come from git (tracked plus new, not ignored), sorted by path, so the output is the same on
every machine. Never prints file contents other than into the output file.

Usage:
  python tools/gen-code-reference.py          # write pranalika/code-reference.md
  python tools/gen-code-reference.py --check  # exit 1 when the committed file is out of date
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "pranalika" / "code-reference.md"
MAX_LEN = 170

GENERATED = {
    "mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/ErrorCodes.kt",
    "apps/web/src/lib/error-codes.generated.ts",
    "supabase/functions/_shared/error-codes.ts",
}
# Data, not schema: the city list is one long insert.
DATA_ONLY = {"supabase/migrations/20261030232730_us_cities.sql"}

KOTLIN = re.compile(
    r"^ {0,4}(?:@\w+(?:\([^)]*\))?\s+)*"
    r"(?:(?:public|internal|protected|override|actual|expect|data|enum|sealed|abstract|open|inline|suspend|const|"
    r"lateinit|operator|infix|value|annotation|inner|external|tailrec)\s+)*"
    r"(?:class|object|interface|fun|val|var|typealias)\b"
)
TYPESCRIPT = re.compile(r"^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|class|type|interface|enum)\b")
PYTHON = re.compile(r"^(?:async\s+)?(?:def|class)\s|^@app\.")
SQL = re.compile(r"^(?:create|alter|grant|revoke|drop|comment)\b", re.IGNORECASE)
SQL_SKIP = re.compile(r"^alter\s+(?:publication|default\s+privileges)\b", re.IGNORECASE)
STRING = re.compile(r'"(?:\\.|[^"\\])*"')

SECTIONS = [
    ("Shared mobile code and Android/iOS (Kotlin)", "kotlin"),
    ("Website, Edge Functions and scripts (TypeScript / TSX)", "typescript"),
    ("Photo service (Python)", "python"),
    ("Database migrations (SQL)", "sql"),
]

HEADER = """# Dzirent - Code reference (C4 level 4, generated)

Generated from the `Preview` branch source by a script (`tools/gen-code-reference.py`; CI fails when this file is out of date). It lists every source file with its line count and every top-level declaration (Kotlin, TypeScript/TSX, Python) and every schema statement (SQL migrations). It is an index, not a hand-written description: the architecture and the meaning live in `pranalika/architecture.md`. Regenerate it instead of editing it.
"""


def repo_files() -> list[str]:
    result = subprocess.run(
        ["git", "-C", str(ROOT), "ls-files", "--cached", "--others", "--exclude-standard"],
        capture_output=True, check=True,
    )
    names = {line.strip() for line in result.stdout.decode("utf-8").splitlines() if line.strip()}
    return sorted(n for n in names if (ROOT / n).is_file())


def kind_of(path: str) -> str | None:
    if path in GENERATED or path in DATA_ONLY:
        return None
    if path.startswith("mobile/") and not path.startswith("mobile/iosApp/") and path.endswith(".kt"):
        return "kotlin"
    if (path.startswith("supabase/functions/") or path.startswith("apps/web/")) and path.endswith((".ts", ".tsx")):
        if path.endswith(".d.ts"):
            return None
        return "typescript"
    if (path.startswith("services/vision/") or path.startswith("supabase/tests/")) and path.endswith(".py"):
        return "python"
    if path.startswith("supabase/migrations/") and path.endswith(".sql"):
        return "sql"
    return None


def declarations(kind: str, lines: list[str]) -> list[tuple[int, str]]:
    found: list[tuple[int, str]] = []
    depth = 0
    for number, line in enumerate(lines, 1):
        hit = False
        if kind == "kotlin":
            hit = (depth == 0 and bool(KOTLIN.match(line)) and not line.rstrip().endswith(",")
                   and not re.match(r"^\s*(?:@\w+\S*\s+)*(?:\w+\s+)*private\b", line)
                   and "companion object" not in line)
            code = STRING.sub("", line.split("//")[0])
            depth = max(0, depth + code.count("(") - code.count(")"))
        elif kind == "typescript":
            hit = bool(TYPESCRIPT.match(line))
        elif kind == "python":
            hit = bool(PYTHON.match(line))
        elif kind == "sql":
            hit = bool(SQL.match(line)) and not SQL_SKIP.match(line)
        if hit:
            found.append((number, line.strip()[:MAX_LEN]))
    return found


def section_order(path: str) -> tuple:
    # Edge Functions before the website, as in the original; otherwise by path.
    return (0 if path.startswith("supabase/functions/") else 1, path)


def generate() -> str:
    groups: dict[str, list[str]] = {kind: [] for _, kind in SECTIONS}
    for path in repo_files():
        kind = kind_of(path)
        if kind:
            groups[kind].append(path)
    out = [HEADER]
    for title, kind in SECTIONS:
        out.append(f"\n## {title}\n\n")
        for path in sorted(groups[kind], key=section_order):
            text = (ROOT / path).read_text(encoding="utf-8", errors="replace")
            lines = text.splitlines()
            out.append(f"\n### `{path}` ({len(lines)} lines)\n\n")
            found = declarations(kind, lines)
            if not found:
                out.append("- (no top-level declarations)\n")
            for number, decl in found:
                out.append(f"- L{number}: `{decl}`\n")
    return "".join(out)


def main() -> int:
    content = generate()
    if "--check" in sys.argv[1:]:
        current = OUTPUT.read_text(encoding="utf-8") if OUTPUT.exists() else ""
        if current.replace("\r\n", "\n") != content:
            print("pranalika/code-reference.md is out of date: run python tools/gen-code-reference.py")
            return 1
        print("pranalika/code-reference.md is up to date")
        return 0
    OUTPUT.write_text(content, encoding="utf-8", newline="\n")
    print("wrote pranalika/code-reference.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
