#!/usr/bin/env bash
set -euo pipefail

# Idempotent: prepares a RunPod pod from scratch to run the BrainScore
# backend. Safe to re-run — every step checks whether it already happened
# before acting.

WORKSPACE_DIR="${WORKSPACE_DIR:-/workspace}"
HF_HOME_DIR="${WORKSPACE_DIR}/hf_cache"
TRIBE_DIR="${WORKSPACE_DIR}/tribev2"
BASHRC="${HOME}/.bashrc"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Configuring HF_HOME=${HF_HOME_DIR}"
mkdir -p "${HF_HOME_DIR}"
export HF_HOME="${HF_HOME_DIR}"
if ! grep -qxF "export HF_HOME=${HF_HOME_DIR}" "${BASHRC}" 2>/dev/null; then
    echo "export HF_HOME=${HF_HOME_DIR}" >> "${BASHRC}"
fi

echo "==> Installing tribev2"
if [ ! -d "${TRIBE_DIR}/.git" ]; then
    git clone https://github.com/facebookresearch/tribev2.git "${TRIBE_DIR}"
else
    echo "    tribev2 is already cloned at ${TRIBE_DIR}, skipping clone"
fi
pip install -e "${TRIBE_DIR}"

echo "==> Installing backend requirements"
pip install -r "${SCRIPT_DIR}/requirements.txt"

echo "==> Downloading nltk punkt_tab tokenizer"
python -c "import nltk; nltk.download('punkt_tab')"

echo "==> Installed versions"
python -c "import torch, torchaudio; print(f'torch={torch.__version__} cuda={torch.version.cuda} torchaudio={torchaudio.__version__}')"

echo "==> Done. Remember to run 'huggingface-cli login' once (the model uses meta-llama/Llama-3.2-3B, which is gated)."
