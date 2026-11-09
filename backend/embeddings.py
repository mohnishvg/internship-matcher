"""Turn text into vectors: LM Studio first, sentence-transformers if it isn't running."""
import json
import os
import urllib.error
import urllib.request

LMSTUDIO_URL = os.environ.get("LMSTUDIO_URL", "http://localhost:1234/v1")
# The name LM Studio shows for the embedding model you loaded.
LMSTUDIO_MODEL = os.environ.get("LMSTUDIO_EMBED_MODEL", "text-embedding-nomic-embed-text-v1.5")
FALLBACK_MODEL = "all-MiniLM-L6-v2"

_local_model = None  # loaded on first use: it takes a few seconds and ~90 MB


def _lmstudio(texts):
    body = json.dumps({"model": LMSTUDIO_MODEL, "input": texts}).encode()
    req = urllib.request.Request(
        f"{LMSTUDIO_URL}/embeddings", data=body, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)["data"]
    return [item["embedding"] for item in sorted(data, key=lambda d: d["index"])]


def _sentence_transformers(texts):
    global _local_model
    if _local_model is None:
        from sentence_transformers import SentenceTransformer
        _local_model = SentenceTransformer(FALLBACK_MODEL)
    return _local_model.encode(texts).tolist()


def embed(texts):
    """Return (vectors, backend_name). All texts go to ONE backend so their vectors are comparable."""
    try:
        return _lmstudio(texts), "lmstudio"
    except (urllib.error.URLError, OSError, ValueError, KeyError):
        # Server down, no embedding model loaded, or an unexpected reply.
        return _sentence_transformers(texts), "sentence-transformers"
