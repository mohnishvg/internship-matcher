"""Extract requirements from a job post and score them against resume bullets."""
import math
import re

# A requirement counts as "matched" if some resume bullet is at least this similar.
# Each model scores on its own scale: MiniLM puts real matches around 0.2-0.5, gaps near 0.1.
# shortcut: 0.2 is set from one sample and 0.5 for LM Studio is untested; retune on your own posts.
THRESHOLDS = {"sentence-transformers": 0.2, "lmstudio": 0.5}
DEFAULT_THRESHOLD = 0.5

BULLET = re.compile(r"^\s*(?:[-*•▪◦·]|\d+[.)])\s+")
SECTION = re.compile(r"(requirement|qualification|skill|you have|what you.?ll need|must|nice to have)", re.I)


def extract_requirements(job_text):
    """Bullet lines from the job post; if there are none, the sentences under a requirements-like heading."""
    lines = [l.strip() for l in job_text.splitlines() if l.strip()]
    bullets = [BULLET.sub("", l) for l in lines if BULLET.match(l)]
    if bullets:
        return bullets
    # shortcut: heuristic parsing; upgrade to an LLM extraction call (LM Studio chat) if posts are messy.
    out, in_section = [], False
    for line in lines:
        if SECTION.search(line) and len(line.split()) <= 6:
            in_section = True
            continue
        if in_section:
            out += [s.strip() for s in re.split(r"(?<=[.;])\s+", line) if s.strip()]
    return out or [s.strip() for s in re.split(r"(?<=[.!?])\s+", job_text) if len(s.split()) >= 3]


def resume_bullets(resume_text):
    """Every resume line with 3+ words; skips headings like 'EDUCATION'."""
    lines = (BULLET.sub("", l).strip() for l in resume_text.splitlines())
    return [l for l in lines if len(l.split()) >= 3]


def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / norm if norm else 0.0


def match(resume_text, job_text, embed):
    """embed(list[str]) -> (list[vector], backend). Returns score 0-100, matched and missing requirements."""
    reqs = extract_requirements(job_text)
    bullets = resume_bullets(resume_text)
    if not reqs or not bullets:
        raise ValueError("Couldn't find requirements in the job post or bullets in the resume.")

    vectors, backend = embed(reqs + bullets)  # one call, so both sides share an embedding space
    req_vecs, bullet_vecs = vectors[: len(reqs)], vectors[len(reqs):]
    threshold = THRESHOLDS.get(backend, DEFAULT_THRESHOLD)

    matched, missing = [], []
    for req, rv in zip(reqs, req_vecs):
        sims = [cosine(rv, bv) for bv in bullet_vecs]
        best = max(range(len(sims)), key=sims.__getitem__)
        item = {"requirement": req, "similarity": round(sims[best], 3), "best_bullet": bullets[best]}
        (matched if sims[best] >= threshold else missing).append(item)

    return {
        "score": round(100 * len(matched) / len(reqs)),
        "matched": sorted(matched, key=lambda i: -i["similarity"]),
        "missing": sorted(missing, key=lambda i: -i["similarity"]),
        "backend": backend,
    }
