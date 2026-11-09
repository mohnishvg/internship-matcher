"""FastAPI app: POST /api/match scores one job post against a resume."""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from embeddings import embed
from matcher import match

app = FastAPI(title="Internship Matcher")


class MatchRequest(BaseModel):
    resume: str = Field(min_length=1, max_length=50_000)
    job: str = Field(min_length=1, max_length=50_000)


@app.post("/api/match")
def match_job(req: MatchRequest):
    try:
        return match(req.resume, req.job, embed)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
