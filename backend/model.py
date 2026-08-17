"""
Loads and runs the TRIBE v2 model.

The model is loaded once at FastAPI startup (see main.py's lifespan) and
reused for every job — loading it per-request would be far too slow.

Set MOCK_MODEL=1 to skip tribev2/torch entirely and return deterministic
fake predictions instead, so the frontend can be developed without a GPU
pod running (see README "Correr todo en local").
"""
import os

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
