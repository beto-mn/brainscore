"""
Loads and runs the TRIBE v2 model.

The model is loaded once at FastAPI startup (see main.py's lifespan) and
reused for every job — loading it per-request would be far too slow.

Set MOCK_MODEL=1 to skip tribev2/torch entirely and return deterministic
fake predictions instead, so the frontend can be developed without a GPU
pod running (see README "Correr todo en local").
"""
import os
import subprocess

_MOCK = os.environ.get("MOCK_MODEL") == "1"

_model = None


def load_model():
    """Load the TRIBE v2 model once. No-op in MOCK_MODEL mode."""
    global _model
    if _MOCK:
        return None

    from tribev2 import TribeModel

    cache_folder = os.environ.get("HF_HOME", "/workspace/hf_cache")
    _model = TribeModel.from_pretrained("facebook/tribev2", cache_folder=cache_folder)
    return _model


def is_loaded() -> bool:
    return _MOCK or _model is not None


def run_inference(video_path: str):
    """
    Returns preds: np.ndarray of shape (timesteps, ~20k vertices fsaverage5).

    In MOCK_MODEL mode returns deterministic fake data of a plausible shape.
    """
    if _MOCK:
        import numpy as np

        rng = np.random.default_rng(42)
        n_timesteps = 120
        n_vertices = 20484
        return rng.normal(loc=0.0, scale=1.0, size=(n_timesteps, n_vertices)).astype("float32")

    if _model is None:
        raise RuntimeError("model not loaded")

    df = _model.get_events_dataframe(video_path=video_path)
    preds, _segments = _model.predict(events=df)
    return preds


def get_video_duration(video_path: str) -> float:
    """Real duration of the uploaded video file, in seconds, read via ffprobe.

    TRIBE v2's n_timesteps does NOT reliably map back to the source video's
    length: it can drop segments with no detected events and chunk long
    videos, so estimating duration as n_timesteps * TR is inaccurate (a
    96s video reported as 320s was traced back to exactly this). Reading
    the file's real duration directly sidesteps that entirely. Raises if
    ffprobe is missing or the file can't be parsed - callers should fall
    back to the TR-based estimate in that case (see scoring.py).
    """
    result = subprocess.run(
        [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(result.stdout.strip())


def release_gpu_memory():
    """Free cached (but unused) CUDA memory after a job.

    Torch keeps freed tensors in its own allocator cache instead of
    returning them to the driver, so back-to-back jobs on a memory-limited
    pod can look like a leak over time even though nothing is still
    referenced. No-op in MOCK_MODEL mode.
    """
    if _MOCK:
        return

    import torch

    if torch.cuda.is_available():
        torch.cuda.empty_cache()
