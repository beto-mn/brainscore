"""
FastAPI app for the BrainScore backend.

Loads the TRIBE v2 model once at startup (model.py) and exposes:
  GET  /health          -> liveness + model load status
  POST /analyze         -> accepts a video, enqueues an async inference job
  GET  /jobs/{job_id}   -> polls job status/result

Inference takes minutes on GPU, so /analyze never blocks on it: it streams
the upload to disk, enqueues a job for the single background worker
(jobs.py), and returns immediately with a job_id for polling.
"""
import contextlib
import os
import shutil
import tempfile
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

import jobs
import model

MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200MB
ALLOWED_EXTENSIONS = {".mp4", ".mov"}
UPLOAD_CHUNK_BYTES = 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    model.load_model()
    jobs.start_worker()
    yield


app = FastAPI(title="BrainScore API", lifespan=lifespan)

_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*")
_origins = ["*"] if _allowed_origins == "*" else [o.strip() for o in _allowed_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": model.is_loaded()}


@app.post("/analyze")
async def analyze(video: UploadFile = File(...)):
    ext = os.path.splitext(video.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported format. Use an MP4 or MOV video.")

    upload_dir = os.environ.get("UPLOAD_DIR", tempfile.gettempdir())
    os.makedirs(upload_dir, exist_ok=True)
    # Each upload gets its own directory so the whole thing - the video plus
    # any intermediate files tribev2/whisperx write alongside it - can be
    # wiped in one shot once the job finishes (see jobs.py's cleanup). The
    # pod's disk is limited, so nothing from an analysis should outlive it.
    job_dir = tempfile.mkdtemp(dir=upload_dir)
    tmp_path = os.path.join(job_dir, f"video{ext}")

    size = 0
    try:
        with open(tmp_path, "wb") as f:
            while chunk := await video.read(UPLOAD_CHUNK_BYTES):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    detail = "The video exceeds the 200MB limit."
                    raise HTTPException(status_code=413, detail=detail)
                f.write(chunk)
    except HTTPException:
        _safe_rmtree(job_dir)
        raise
    except Exception as exc:
        _safe_rmtree(job_dir)
        raise HTTPException(status_code=500, detail="Could not save the video.") from exc
    finally:
        await video.close()

    job_id = jobs.create_job(tmp_path)
    return {"job_id": job_id}


@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    job = jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return {"status": job["status"], "result": job["result"], "error": job["error"]}


def _safe_rmtree(path: str):
    with contextlib.suppress(OSError):
        shutil.rmtree(path)
