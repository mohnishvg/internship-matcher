# Internship Matcher

Paste your resume and some job posts. The app ranks the jobs by how well your resume covers each one's requirements, and lists the matched and missing skills.

## How it works

1. `backend/matcher.py` pulls requirements out of the job post (bullet lines first, then sentences under a "Requirements"/"Qualifications"/"Skills" heading).
2. Your resume is split into lines of 3+ words (one bullet per line works best).
3. `backend/embeddings.py` embeds everything with LM Studio (`http://localhost:1234/v1`). If LM Studio isn't running, it falls back to the local `all-MiniLM-L6-v2` sentence-transformers model.
4. Each requirement gets its best cosine similarity against your bullets. It counts as matched at or above the cutoff for the model in use: **0.35** for MiniLM and **0.55** for LM Studio. The score is the percentage of requirements matched.
5. Keyword check: if a requirement names specific tools (from `TOOLS` in `backend/matcher.py`, e.g. Palantir, MLflow, SQL) and your resume mentions none of them, it counts as missing whatever its similarity.

## Setup (everything stays inside this folder)

Backend, in a virtual environment:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Frontend:

```bash
cd frontend
npm install
```

Optional: in LM Studio, download and load *Qwen3-Embedding-0.6B* (`lms get "https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF@q8_0"`, 639 MB), then start the local server on port 1234. The backend asks for `text-embedding-qwen3-embedding-0.6b` by default; to use another model, set `LMSTUDIO_EMBED_MODEL` to its name and retune the LM Studio cutoff.

## Run

Terminal 1 (backend on :8000):

```bash
cd backend && source .venv/bin/activate && uvicorn main:app --reload
```

Terminal 2 (frontend on :5173; it forwards `/api` to the backend):

```bash
cd frontend && npm run dev
```

Open http://localhost:5173.

## Check the matcher

Needs no installs and no model:

```bash
cd backend && python3 test_matcher.py
```

## Notes

- The first fallback run downloads the MiniLM model (~90 MB) into `~/.cache/huggingface`.
- LM Studio and MiniLM produce similarities on different scales, so each has its own cutoff in `THRESHOLDS` (`backend/matcher.py`). Both were picked on 15 real postings; the LM Studio value was tuned with Qwen3-Embedding-0.6B, the default model. If everything comes back matched or everything missing, tune them.
- Jobs live only in the browser tab; reloading clears them.
