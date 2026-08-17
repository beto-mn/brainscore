"""
In-memory async job queue for video analysis.

A single background thread consumes jobs sequentially — the GPU pod has one
A40 and doesn't support concurrent inference, so a single worker is enough.
Job state lives in a plain dict guarded by a lock; no DB needed since jobs
are ephemeral and the process is a single instance.
"""
import contextlib
import os
import queue
import threading
import uuid
from enum import StrEnum

import model as model_module
from scoring import compute_score


class JobStatus(StrEnum):
    QUEUED = "queued"
    PROCESSING = "processing"
    DONE = "done"
    ERROR = "error"


_jobs: dict[str, dict] = {}
_lock = threading.Lock()
_queue: "queue.Queue[tuple[str, str]]" = queue.Queue()
_worker_thread: threading.Thread | None = None


def create_job(video_path: str) -> str:
    job_id = str(uuid.uuid4())
    with _lock:
        _jobs[job_id] = {"status": JobStatus.QUEUED, "result": None, "error": None}
    _queue.put((job_id, video_path))
    return job_id


def get_job(job_id: str) -> dict | None:
    with _lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None


def _set_job(job_id: str, **fields):
    with _lock:
        _jobs[job_id].update(fields)


def _worker_loop():
    while True:
        job_id, video_path = _queue.get()
        try:
            _set_job(job_id, status=JobStatus.PROCESSING)
            preds = model_module.run_inference(video_path)
            result = compute_score(preds)
            _set_job(job_id, status=JobStatus.DONE, result=result)
        except Exception as exc:
            _set_job(job_id, status=JobStatus.ERROR, error=str(exc))
        finally:
            with contextlib.suppress(OSError):
                os.remove(video_path)
            _queue.task_done()


def start_worker():
    """Idempotent: safe to call multiple times (e.g. under --reload)."""
    global _worker_thread
    if _worker_thread is None or not _worker_thread.is_alive():
        _worker_thread = threading.Thread(target=_worker_loop, daemon=True)
        _worker_thread.start()
