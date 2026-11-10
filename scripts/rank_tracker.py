"""Rank the job-tracker roles against the resume with the app's own matcher.

Run from anywhere: backend/.venv/bin/python scripts/rank_tracker.py
Reads data/tracker_roles.json and data/resume_for_matcher.txt,
writes results/tracker_ranking.md and results/tracker_ranking.json.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from embeddings import embed  # noqa: E402
from matcher import match  # noqa: E402


def cell(text):
    """Make text safe inside a Markdown table cell."""
    return str(text).replace("|", "\\|").replace("\n", " ")


def main():
    roles = json.loads((ROOT / "data" / "tracker_roles.json").read_text())["roles"]
    resume = (ROOT / "data" / "resume_for_matcher.txt").read_text()

    results = []
    for r in roles:
        print(f"Scoring {r['company']}: {r['role']}", file=sys.stderr)
        m = match(resume, r["job_text"], embed)  # only job_text is scored; eligibility is for reading
        results.append({
            "id": r["id"],
            "company": r["company"],
            "role": r["role"],
            "link": r["link"],
            "score": m["score"],
            "matched_count": len(m["matched"]),
            "total": len(m["matched"]) + len(m["missing"]),
            "backend": m["backend"],
            "eligibility": r.get("eligibility", []),
            "matched": m["matched"],
            "missing": m["missing"],
        })

    assert len(results) == len(roles), "every role should be scored"
    results.sort(key=lambda x: (-x["score"], -x["matched_count"], x["company"]))
    backends = sorted({x["backend"] for x in results})

    out = ROOT / "results"
    out.mkdir(exist_ok=True)
    (out / "tracker_ranking.json").write_text(json.dumps({"backends": backends, "roles": results}, indent=2))

    lines = [
        "# Tracker ranking",
        "",
        f"Embedding model: {', '.join(backends)}. Score = % of requirements matched. "
        "Top missing = tools your resume doesn't name first, then the requirements furthest from any resume bullet. "
        "Eligibility is not scored.",
        "",
        "| Rank | Company | Role | Score | Matched | Top 3 missing | Eligibility | Link |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for rank, x in enumerate(results, 1):
        # Named-tool gaps first (they can look similar in wording), then lowest similarity.
        gaps = sorted(x["missing"], key=lambda i: ("tools_not_in_resume" not in i, i["similarity"]))[:3]
        lines.append("| " + " | ".join([
            str(rank),
            cell(x["company"]),
            cell(x["role"]),
            f"{x['score']}%",
            f"{x['matched_count']}/{x['total']}",
            cell("; ".join(g["requirement"] for g in gaps) or "none"),
            cell("; ".join(x["eligibility"]) or "none listed"),
            f"[posting]({x['link']})",
        ]) + " |")
    (out / "tracker_ranking.md").write_text("\n".join(lines) + "\n")
    print(f"Wrote {out / 'tracker_ranking.md'} and tracker_ranking.json ({', '.join(backends)})", file=sys.stderr)


if __name__ == "__main__":
    main()
