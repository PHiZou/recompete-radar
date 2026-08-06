#!/usr/bin/env python
"""Play with the Sunlight database from the terminal.

    python sql/query.py --list             # show the lessons in learn_sql.sql
    python sql/query.py --lesson 6         # run lesson 6
    python sql/query.py "SELECT 1"         # run any SQL
    python sql/query.py                    # interactive prompt (blank line = run)

Reads DATABASE_URL from .env. SELECT only — anything else is refused.
"""

import os
import re
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
LESSONS_FILE = ROOT / "sql" / "learn_sql.sql"
load_dotenv(ROOT / ".env")

READ_ONLY = re.compile(r"^\s*(select|with|explain|show)\b", re.I)


def connect():
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL not set — check your .env")
    return psycopg2.connect(url)


def parse_lessons():
    """Split learn_sql.sql on its `-- ── Title ───` headers."""
    text = LESSONS_FILE.read_text()
    parts = re.split(r"^-- ── (.+?) ─+\n", text, flags=re.M)[1:]
    return [
        (title.strip(), body.strip())
        for title, body in zip(parts[0::2], parts[1::2])
    ]


def show(cur):
    if cur.description is None:
        print("(no rows returned)")
        return
    cols = [d[0] for d in cur.description]
    rows = [["" if v is None else str(v) for v in row] for row in cur.fetchall()]
    widths = [
        min(40, max(len(c), *(len(r[i]) for r in rows)) if rows else len(c))
        for i, c in enumerate(cols)
    ]
    fmt = "  ".join(f"{{:<{w}}}" for w in widths)
    print(fmt.format(*(c[:40] for c in cols)))
    print("  ".join("-" * w for w in widths))
    for r in rows:
        print(fmt.format(*(v[:40] for v in r)))
    print(f"\n({len(rows)} rows)")


def strip_comments(sql):
    return "\n".join(
        line for line in sql.splitlines() if not line.lstrip().startswith("--")
    ).strip()


def run(cur, sql):
    code = strip_comments(sql)
    if not code:
        return
    if not READ_ONLY.match(code):
        print("refused: this runner only executes SELECT / WITH / EXPLAIN / SHOW")
        return
    try:
        cur.execute(sql)
        show(cur)
    except psycopg2.Error as e:
        cur.connection.rollback()
        print(f"error: {str(e).strip()}")


def main():
    args = sys.argv[1:]

    if args and args[0] == "--list":
        for i, (title, _) in enumerate(parse_lessons(), 1):
            print(f"{i:2}. {title}")
        return

    conn = connect()
    conn.set_session(readonly=True)
    cur = conn.cursor()

    if args and args[0] == "--lesson":
        lessons = parse_lessons()
        n = int(args[1])
        if not 1 <= n <= len(lessons):
            sys.exit(f"pick 1–{len(lessons)}; see --list")
        title, body = lessons[n - 1]
        print(f"── {title} ──\n{body}\n")
        for stmt in filter(str.strip, strip_comments(body).split(";")):
            run(cur, stmt)
    elif args:
        run(cur, " ".join(args))
    else:
        print("Type SQL. Blank line runs it. Ctrl-D or 'quit' to exit.\n")
        buf = []
        while True:
            try:
                line = input("sql> " if not buf else "...> ")
            except EOFError:
                break
            if line.strip() in ("quit", "exit"):
                break
            if line.strip():
                buf.append(line)
                continue
            if buf:
                run(cur, "\n".join(buf).rstrip(";"))
                buf = []
                print()

    conn.close()


if __name__ == "__main__":
    main()
