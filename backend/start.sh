#!/usr/bin/env bash
set -euo pipefail

# Starts the API inside a tmux session ("api"), killing the previous session
# if it exists. Meant to be run both manually and from deploy-backend.yml on
# every redeploy.

SESSION="api"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST="0.0.0.0"
PORT="8000"

if tmux has-session -t "${SESSION}" 2>/dev/null; then
    echo "==> Killing previous tmux session: ${SESSION}"
    tmux kill-session -t "${SESSION}"
fi

echo "==> Starting uvicorn on ${HOST}:${PORT} inside tmux (${SESSION})"
tmux new-session -d -s "${SESSION}" -c "${SCRIPT_DIR}" \
    "uvicorn main:app --host ${HOST} --port ${PORT}"

echo "==> Done. To view logs: tmux attach -t ${SESSION} (Ctrl+B, D to detach without killing it)"
