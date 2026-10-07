#!/usr/bin/env python3
"""Mutation runner: inject ONE bug, run the targeted tests, expect RED, restore. Serial, on the working tree, from the repo root.

usage:  python3 scripts/mutations/run-mutations.py <mutations.py> <results.jsonl> [--baseline] [ids...]

  --baseline   first run every distinct (command, build) pair UNMUTATED and stop if any is red: a mutation "caught" by an already-red
               suite proves nothing. (Do this once per session; it is the most important step.)
  ids...       only these mutation ids (e.g. `I1 M10 Q9`); the default is all of them.

mutations.py defines MUTATIONS = [dict(id, desc, edits=[(file, old, new)], cmd, build=bool)]. Needs TEST_DATABASE_URL (…_test).
  · `old` must occur EXACTLY once in the file (the runner refuses otherwise — a pattern that drifted is a mutation that tests nothing).
  · `build`    : run `pnpm build` after the edit (integration/api/e2e run the built app; unit and integration-on-source do not need it).
Verdicts:  CAUGHT (tests went red — what we want) · SURVIVED (tests stayed green: a missing/weak test, or an equivalent mutant — decide
and write it down) · BUILD-FAIL (the mutation does not compile: rewrite it so it does) · ERROR (pattern drift etc.).
The source files are restored with `git checkout -- <file>` in a `finally` block, and the runner refuses to start on a tree with
uncommitted changes to tracked files, so a crash can never leave a mutated source behind unnoticed: `git status` shows it at once.
One run of a mutation costs a build (~1 min) + its test command; budget accordingly, and run only the ids you need while iterating."""
import json, os, re, subprocess, sys, time

args = sys.argv[1:]
baseline = "--baseline" in args
args = [a for a in args if a != "--baseline"]
if len(args) < 2:
    raise SystemExit(__doc__)
mfile, out, *only = args
only = set(only)
ns = {}
exec(open(mfile).read(), ns)
MUTATIONS = [m for m in ns["MUTATIONS"] if not only or m["id"] in only]


def sh(cmd, timeout=1800):
    p = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout + p.stderr


if sh("git diff --quiet && git diff --cached --quiet")[0] != 0:
    raise SystemExit("refusing to start: the working tree has uncommitted changes to tracked files (commit or stash them first)")

if not os.environ.get("TEST_DATABASE_URL", "").split("/")[-1].endswith("_test"):
    raise SystemExit("set TEST_DATABASE_URL to a database whose name ends in _test (never a development database)")

# every pattern must still match exactly once — checked up front, for ALL selected mutations, before anything runs
for m in MUTATIONS:
    for f, old, _ in m["edits"]:
        n = open(f).read().count(old)
        if n != 1:
            raise SystemExit(f"{m['id']}: pattern occurs {n}x in {f}: {old[:80]!r}")

if baseline:
    seen = set()
    for m in MUTATIONS:
        key = (m["cmd"], bool(m.get("build")))
        if key in seen:
            continue
        seen.add(key)
        if m.get("build"):
            code, text = sh("pnpm build", 900)
            if code != 0:
                raise SystemExit("BASELINE: the unmutated build fails:\n" + text[-1500:])
        code, text = sh(m["cmd"])
        if code != 0:
            raise SystemExit(f"BASELINE RED for: {m['cmd']}\n" + text[-2500:])
        print("baseline green:", m["cmd"][:110], flush=True)

done = {json.loads(l)["id"] for l in open(out)} if os.path.exists(out) else set()
for m in MUTATIONS:
    if m["id"] in done:
        continue  # resumable: a finished mutation is not run again (delete its line to re-run it)
    rec = {"id": m["id"], "desc": m["desc"], "started": time.strftime("%H:%M:%S")}
    files = sorted({f for f, _, _ in m["edits"]})
    try:
        for f, old, new in m["edits"]:
            text = open(f).read()
            open(f, "w").write(text.replace(old, new))
        if m.get("build"):
            code, text = sh("pnpm build", 900)
            if code != 0:
                rec.update(result="BUILD-FAIL", detail=text[-600:])
                raise StopIteration
        code, text = sh(m["cmd"])
        failed = re.findall(r"^\s+\d+\) (\[.*)$", text, re.M)[:3]
        tail = [l for l in text.splitlines() if re.search(r"\d+ (passed|failed)", l)][-2:]
        rec.update(result="CAUGHT" if code != 0 else "SURVIVED", failed=failed, summary=tail)
    except StopIteration:
        pass
    except Exception as e:  # noqa
        rec.update(result="ERROR", detail=str(e))
    finally:
        sh("git checkout -- " + " ".join(f"'{f}'" for f in files))
    rec["finished"] = time.strftime("%H:%M:%S")
    open(out, "a").write(json.dumps(rec) + "\n")
    print(f"{rec['result']:9} {m['id']:5} {m['desc'][:90]}", flush=True)

rows = [json.loads(l) for l in open(out)]
print("\n", {k: sum(1 for r in rows if r["result"] == k) for k in ("CAUGHT", "SURVIVED", "BUILD-FAIL", "ERROR")})
for r in rows:
    if r["result"] != "CAUGHT":
        print(f"  {r['result']:10} {r['id']:5} {r['desc'][:100]}")
