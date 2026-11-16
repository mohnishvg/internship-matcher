"""Extract requirements from a job post and score them against resume bullets."""
import math
import re

# A requirement counts as "matched" if some resume bullet is at least this similar.
# Each model scores on its own scale. With MiniLM, broad resume lines reach ~0.2-0.3 against
# almost any requirement, so 0.35 (picked on 15 real postings) keeps those out.
# LM Studio's 0.57 was picked with Qwen3-Embedding-0.6B (scores sit in a 0.4-0.8 band) on 98
# hand-labeled requirements from the 16 tracker roles, with soft skills left unscored; 0.57-0.58
# scored best (79/98 vs 73/98 for the old 0.55 with soft skills scored).
# shortcut: one value for every LM Studio model; retune if you load a different one.
THRESHOLDS = {"sentence-transformers": 0.35, "lmstudio": 0.57}
DEFAULT_THRESHOLD = 0.5

# Named tools: if a requirement names some of these and the resume mentions none of them,
# it's a gap no matter how similar the wording is (embeddings match "MLflow" to "machine learning").
# Left out on purpose: C, R and Go, which collide with ordinary words.
# shortcut: hand-kept list; add tools as new postings name them.
TOOLS = [
    "Python", "Java", "JavaScript", "TypeScript", "Kotlin", "Swift", "Rust", "Ruby", "Perl", "Bash",
    "Assembly", "Golang", "C++", "C#", ".NET", "SQL", "NoSQL", "PostgreSQL", "React", "Angular",
    "Node.js", "Android", "iOS", "AWS", "Azure", "GCP", "GovCloud", "Docker", "Kubernetes", "Git",
    "Jenkins", "Travis", "PyTorch", "TensorFlow", "Hugging Face", "MLflow", "SageMaker", "Vertex AI",
    "Palantir", "MCP", "RAG", "ETL", "Microsoft Office", "Excel", "Scrum", "Agile",
]
# Whole-word match that also works for names ending in + or # (C++, C#).
_TOOL_PATTERN = {t: r"(?<![\w+#.])" + re.escape(t) + r"(?![\w+#])" for t in TOOLS}


def named_tools(text, ignore_case=False):
    """The TOOLS named in text. Case-sensitive by default so "react quickly" isn't React."""
    flags = re.I if ignore_case else 0
    return [t for t, p in _TOOL_PATTERN.items() if re.search(p, text, flags)]


# Wording that makes the named tools examples or one option among others ("cloud (AWS) ... and/or
# version control", "AI tech such as MCP"). Then a resume can meet the requirement without any of
# them, so the similarity decides instead of the keyword check.
OPEN_ENDED = re.compile(r"\band/or\b|\bsuch as\b|\be\.g\.|\bor similar\b|\bfor example\b", re.I)


BULLET = re.compile(r"^\s*(?:[-*•▪◦·]|\d+[.)])\s+")
SECTION = re.compile(r"(requirement|qualification|skill|you have|what you.?ll need|must|nice to have)", re.I)

# Soft skills: a technical resume rarely states them, so their scores sat right at the cutoff
# (0.44-0.55 with Qwen3) and decided nothing. A line counts as one only if it names no technical
# subject, so "apply algorithms to problem-solving" is still scored.
SOFT = re.compile(
    r"communicat|interpersonal|team|collaborat|leadership|\blead\b|influence|self-motivat|self-starter|"
    r"initiative|independent|detail|organiz|problem.solving|analytical|critical thinking|learner|"
    r"learn new|adapt|curious|creativ|proactive|urgency|feedback|deadline|prioritiz|professional|"
    r"passion|ownership|embraces change", re.I)
TECHNICAL = re.compile(
    r"algorithm|data structure|program|\bcod(e|ing)\b|software|language|framework|database|cloud|"
    r"\bapi\b|\bml\b|machine learning|\bai\b|llm|security|network|operating system|data|stack|"
    r"frontend|backend|devops", re.I)


def is_soft_skill(requirement):
    return bool(SOFT.search(requirement)) and not TECHNICAL.search(requirement) and not named_tools(requirement)


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
    all_reqs = extract_requirements(job_text)
    bullets = resume_bullets(resume_text)
    if not all_reqs or not bullets:
        raise ValueError("Couldn't find requirements in the job post or bullets in the resume.")
    reqs = [r for r in all_reqs if not is_soft_skill(r)]
    not_scored = [{"requirement": r, "reason": "soft skill"} for r in all_reqs if is_soft_skill(r)]
    if not reqs:  # a post of only soft skills: score them rather than nothing
        reqs, not_scored = all_reqs, []

    vectors, backend = embed(reqs + bullets)  # one call, so both sides share an embedding space
    req_vecs, bullet_vecs = vectors[: len(reqs)], vectors[len(reqs):]
    threshold = THRESHOLDS.get(backend, DEFAULT_THRESHOLD)
    resume_tools = set(named_tools(resume_text, ignore_case=True))  # lenient: "assembly" counts

    matched, missing = [], []
    for req, rv in zip(reqs, req_vecs):
        sims = [cosine(rv, bv) for bv in bullet_vecs]
        best = max(range(len(sims)), key=sims.__getitem__)
        item = {"requirement": req, "similarity": round(sims[best], 3), "best_bullet": bullets[best]}
        tools = named_tools(req)
        if tools and not resume_tools.intersection(tools) and not OPEN_ENDED.search(req):
            item["tools_not_in_resume"] = tools  # a listed alternative you have would have counted
            missing.append(item)
        else:
            (matched if sims[best] >= threshold else missing).append(item)

    return {
        "score": round(100 * len(matched) / len(reqs)),
        "matched": sorted(matched, key=lambda i: -i["similarity"]),
        "missing": sorted(missing, key=lambda i: -i["similarity"]),
        "not_scored": not_scored,
        "backend": backend,
    }
