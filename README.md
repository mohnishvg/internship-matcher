# Internship Matcher

Paste your resume and some job posts. The app ranks the jobs by how well your resume covers each one's requirements, and lists the matched and missing skills.

## How it works

1. `backend/matcher.py` pulls requirements out of the job post (bullet lines first, then sentences under a "Requirements"/"Qualifications"/"Skills" heading).
2. Your resume is split into lines of 3+ words (one bullet per line works best).
3. `backend/embeddings.py` embeds everything with LM Studio (`http://localhost:1234/v1`). If LM Studio isn't running, it falls back to the local `all-MiniLM-L6-v2` sentence-transformers model.
4. Each requirement gets its best cosine similarity against your bullets. It counts as matched at or above the cutoff for the model in use: **0.2** for MiniLM and **0.5** for LM Studio. The score is the percentage of requirements matched.

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

Optional: in LM Studio, load an embedding model (e.g. *nomic-embed-text-v1.5*) and start the local server on port 1234. If your model has a different name, set `LMSTUDIO_EMBED_MODEL` to it before starting the backend.

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
- LM Studio and MiniLM produce similarities on different scales, so each has its own cutoff in `THRESHOLDS` (`backend/matcher.py`). The MiniLM value comes from one sample, and the LM Studio value is a guess. If everything comes back matched or everything missing, tune them.
- Jobs live only in the browser tab; reloading clears them.
