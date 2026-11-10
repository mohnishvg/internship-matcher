"""Self-check for matcher.py. Needs no installs or model: run `python3 test_matcher.py`."""
from matcher import extract_requirements, match, named_tools, resume_bullets

VOCAB = ["python", "react", "sql", "kubernetes", "api"]


def fake_embed(texts):
    # One dimension per keyword, so "same keyword" means similarity 1.0.
    return [[float(w in t.lower()) for w in VOCAB] for t in texts], "fake"


JOB = """Software Intern
Requirements:
- Experience with Python
- Built a React frontend
- Kubernetes in production
"""
RESUME = """EDUCATION
- Wrote a Python API for course data
- Built a React dashboard for a club
"""

assert extract_requirements(JOB) == ["Experience with Python", "Built a React frontend", "Kubernetes in production"]
assert extract_requirements("Qualifications\nYou know SQL. You ship APIs.") == ["You know SQL.", "You ship APIs."]
assert resume_bullets(RESUME) == ["Wrote a Python API for course data", "Built a React dashboard for a club"]

r = match(RESUME, JOB, fake_embed)
assert r["score"] == 67, r
assert [m["requirement"] for m in r["missing"]] == ["Kubernetes in production"]
assert {m["requirement"] for m in r["matched"]} == {"Experience with Python", "Built a React frontend"}

# Similarity 0.4 matches under MiniLM's 0.35 cutoff but not under LM Studio's 0.55.
def embed_at(backend):
    return lambda texts: ([[1.0, 0.0]] + [[0.4, 0.84 ** 0.5]] * (len(texts) - 1), backend)

ONE_REQ = "- Python\n"
assert match(RESUME, ONE_REQ, embed_at("sentence-transformers"))["score"] == 100
assert match(RESUME, ONE_REQ, embed_at("lmstudio"))["score"] == 0

# Keyword check: whole names only, and proper capitalization in requirements.
assert named_tools("JavaScript and NoSQL") == ["JavaScript", "NoSQL"]  # not Java, not SQL
assert named_tools("C++ or C#, plus Git") == ["C++", "C#", "Git"]
assert named_tools("Git and GitHub") == ["Git"]
assert named_tools("ability to react quickly") == []
assert named_tools("LC-3 assembly", ignore_case=True) == ["Assembly"]

# A named tool the resume lacks is a gap even at similarity 1.0; one alternative you have is enough.
same = lambda texts: ([[1.0, 0.0]] * len(texts), "fake")
r = match(RESUME, "- Palantir Foundry or AWS\n- Java, Python or Go\n", same)
assert [m["requirement"] for m in r["missing"]] == ["Palantir Foundry or AWS"], r
assert r["missing"][0]["tools_not_in_resume"] == ["AWS", "Palantir"]
assert [m["requirement"] for m in r["matched"]] == ["Java, Python or Go"]

try:
    match("", JOB, fake_embed)
    raise AssertionError("empty resume should fail")
except ValueError:
    pass

print("ok")
