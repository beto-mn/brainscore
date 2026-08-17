"""
Computes simple, documented metrics from TRIBE v2 predictions.

TRIBE v2 predicts fMRI-like activation for ~20k vertices (fsaverage5 surface)
per timestep. These metrics are a first-pass placeholder: they treat every
vertex equally and reduce the whole brain to a single global activation
signal. A real "brain potential" score should instead weight or select
specific ROIs (regions of interest) tied to attention, emotion, memory, etc.

TODO(scoring-v2): replace the whole-brain average with a weighted
combination of specific fsaverage5 ROIs once there is a validated mapping
from "brain potential" to particular networks (salience, reward, DMN...).
"""
import numpy as np

# TRIBE v2 operates on fMRI-style timesteps sampled at the standard TR used
# during training/fine-tuning; used only to estimate a human-readable duration.
TR_SECONDS = 1.49


def compute_score(preds: np.ndarray) -> dict:
    """
    preds: array-like of shape (timesteps, n_vertices) with raw model predictions.

    Returns a dict shaped as:
        {
            "score": int,                    # 0-100, placeholder normalization
            "activation_timeline": [float],  # <=100 points, for plotting
            "stats": {
                "mean_activation": float,
                "std_activation": float,
                "max_activation": float,
                "min_activation": float,
                "n_timesteps": int,
                "n_vertices": int,
            },
            "duration_s": float,
        }
    """
    preds = np.asarray(preds)
    if preds.ndim != 2:
        raise ValueError(f"expected preds with shape (timesteps, vertices), got {preds.shape}")

    n_timesteps, n_vertices = preds.shape

    per_timestep_mean = preds.mean(axis=1)
    global_mean = float(preds.mean())
    global_std = float(preds.std())

    # Placeholder score: squash (mean + std) of global activation into 0-100.
    # See module TODO above — this says nothing about specific brain regions yet.
    raw_score = global_mean + global_std
    score = int(np.clip(round(_sigmoid_scale(raw_score) * 100), 0, 100))

    timeline = _downsample(per_timestep_mean, max_points=100)
    duration_s = float(n_timesteps * TR_SECONDS)

    return {
        "score": score,
        "activation_timeline": [float(x) for x in timeline],
        "stats": {
            "mean_activation": global_mean,
            "std_activation": global_std,
            "max_activation": float(preds.max()),
            "min_activation": float(preds.min()),
            "n_timesteps": int(n_timesteps),
            "n_vertices": int(n_vertices),
        },
        "duration_s": duration_s,
    }


def _sigmoid_scale(x: float, k: float = 5.0) -> float:
    """Squash an unbounded raw score into (0, 1) so it can be shown as 0-100."""
    return 1.0 / (1.0 + np.exp(-x / k))


def _downsample(arr: np.ndarray, max_points: int = 100) -> np.ndarray:
    """Average-pool a 1D array down to at most max_points values."""
    n = len(arr)
    if n <= max_points:
        return arr
    bin_size = int(np.ceil(n / max_points))
    n_bins = int(np.ceil(n / bin_size))
    padded = np.pad(arr, (0, n_bins * bin_size - n), mode="edge")
    return padded.reshape(n_bins, bin_size).mean(axis=1)
