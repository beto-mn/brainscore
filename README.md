# 🧠 BrainScore

Analyzes the "brain potential" of a video using [TRIBE v2](https://github.com/facebookresearch/tribev2), a model that predicts fMRI responses from video/audio/text.

Monorepo:

- `backend/` — 🐍 FastAPI API that runs TRIBE v2 inference on a RunPod GPU pod.
- `frontend/` — ⚛️ Next.js app deployed on Vercel to upload a video and view the result.
- `.github/workflows/` — 🤖 CI (lint + build) and automatic deploy for both.

## 🗺️ Architecture at a glance

- The backend runs on a **RunPod pod** (A40 GPU, 48GB) using the **RunPod PyTorch 2.8.0** template (torch 2.8, CUDA 12.8), with a **persistent volume mounted at `/workspace`**. Port 8000 is exposed via RunPod's HTTPS proxy.
- `POST /analyze` saves the video and enqueues a job; inference (minutes) runs on a sequential background worker. The frontend polls `GET /jobs/{id}` every 5s.
- The frontend lives on **Vercel**, with its `NEXT_PUBLIC_API_URL` pointing at the RunPod proxy URL of the active pod.

---

## 1. 🖥️ Pod setup (backend)

### 1.1 Run the provisioning script

`provision_pod.sh` (at the repo root) is idempotent and self-contained: it clones this repo *and* `facebookresearch/tribev2` into `/workspace`, so you don't need to `git clone` manually first. Run it from a fresh SSH session on the pod (see section 2 for how to get host/port):

```bash
curl -o provision_pod.sh https://raw.githubusercontent.com/beto-mn/brainscore/master/provision_pod.sh
bash provision_pod.sh --start
```

`--start` also brings up the API at the end (see 1.3). Omit it if you just want to provision without starting the server yet.

If the repo is already on the volume (e.g. re-provisioning after a Stop/Start), just run it directly:

```bash
cd /workspace/brainscore
bash provision_pod.sh --start
```

This will:

- Configure `TERM=xterm-256color`, `HF_HOME=/workspace/hf_cache` and `HF_HUB_ENABLE_HF_TRANSFER=0` persistently in `~/.bashrc` — fixes tmux refusing to start under modern terminals, keeps the HuggingFace cache (weights) on the persistent volume, and avoids `tribev2`'s internal `whisperx` step crashing with `hf_transfer package is not available` (some RunPod templates ship that variable set to `1`).
- Clone (or `git pull`) this repo into `/workspace/brainscore`.
- Clone `facebookresearch/tribev2` into `/workspace/tribev2` and install it with `pip install -e`.
- Install `backend/requirements.txt` and `nltk`.
- Pin `numpy`/`torchvision`/`torchaudio` to versions compatible with the pod's preinstalled torch 2.8, avoiding mismatches like `operator torchvision::nms does not exist` or `undefined symbol: aoti_torch_abi_version`.
- Download the `nltk punkt_tab` tokenizer.
- Authenticate with HuggingFace (see 1.2).
- Run a final verification: installed versions, `torchvision::nms`, `punkt_tab`, CUDA availability and GPU name.

> ⚠️ **Note:** `torch` itself is never touched by this script — it's already preinstalled in the pod image (RunPod PyTorch 2.8.0) and reinstalling it could break the image's CUDA build. Only `torchvision`/`torchaudio`/`numpy` are pinned to match it.

### 1.2 HuggingFace authentication

TRIBE v2 uses `meta-llama/Llama-3.2-3B`, which is a **gated** model on HuggingFace. The account already has access granted, but the pod still needs to authenticate — the script handles this automatically:

- **Non-interactive:** set `HF_TOKEN` before running the script: `HF_TOKEN=hf_xxx bash provision_pod.sh`.
- **Interactive:** if no `HF_TOKEN` is set and there's no cached session yet, the script prompts with `hf auth login` (the current CLI command — `huggingface-cli login` is deprecated).

The token is cached under `HF_HOME` (on the persistent volume), so this only needs to happen once per volume — it survives Stops, but not Terminates.

### 1.3 Start the API

If you didn't pass `--start` above:

```bash
bash backend/start.sh
```

This starts `uvicorn main:app --host 0.0.0.0 --port 8000` inside a `tmux` session named `api`, killing any previous session with that name. To view logs:

```bash
tmux attach -t api   # Ctrl+B, D to detach without killing the session
```

Verify it responds:

```bash
curl https://<your-pod>-8000.proxy.runpod.net/health
# {"status": "ok", "model_loaded": true}
```

### 🛑 Stop, not Terminate

When pausing the pod, use **Stop** in the RunPod console — **never Terminate**. `Terminate` deletes the persistent volume (`/workspace`), meaning you'd lose the repo, the HuggingFace cache (`HF_HOME`), and have to redo the whole setup and login. `Stop` keeps the volume and only frees the GPU.

---

## 2. ⚙️ Setting up automatic backend deploys (GitHub Actions)

`deploy-backend.yml` runs on every push to `master` that touches `backend/**`: it connects to the pod via SSH, runs `git pull`, reinstalls `requirements.txt` if it changed, and re-runs `start.sh`.

### 2.1 Getting the pod's SSH host and port

In the RunPod console, open the pod → **Connect** tab → **SSH over exposed TCP**. You'll see something like:

```
ssh root@<host> -p <port> -i ~/.ssh/id_ed25519
```

Copy `<host>` and `<port>` — they change every time the pod is recreated, so if you recreate the pod you'll need to update the secrets.

### 2.2 Configuring the GitHub secrets

In **Settings → Secrets and variables → Actions** of the repo, create:

| Secret | Value |
|---|---|
| `RUNPOD_SSH_HOST` | The `<host>` from the Connect tab |
| `RUNPOD_SSH_PORT` | The `<port>` from the Connect tab |
| `RUNPOD_SSH_KEY` | The **private** SSH key (paired with the public key added in RunPod) |

> 🔓 **Documented security trade-off:** the workflow uses `appleboy/ssh-action`, which does not verify the server's host key (no `known_hosts` pinning). This trade-off is accepted because the pod's host/IP changes every time it's recreated, which would break the deploy if we pinned the host key. Authentication is still protected by the private key in the secret; what's lost is protection against a network-level MITM attack. If this is unacceptable for your threat model, consider pinning the pod's IP with RunPod Network Volumes + a static IP and manually pinning the host key.

---

## 3. ▲ Vercel setup (frontend)

1. In Vercel, **Add New → Project**, import this repo.
2. Under **Root Directory**, select `frontend/`.
3. Framework Preset: Next.js (auto-detected).
4. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_API_URL` = `https://<your-pod>-8000.proxy.runpod.net`
5. Deploy.

With the native Vercel-GitHub integration connected, every push to `master` (or PR, as a preview) triggers a deploy automatically — this doesn't depend on `deploy-frontend.yml`, which only runs lint + build as a CI gate.

> 🔁 If you recreate the RunPod pod, the proxy URL changes. Update `NEXT_PUBLIC_API_URL` in Vercel (Settings → Environment Variables) and redeploy for it to take effect — **never hardcode this URL in the code**.

---

## 4. 💻 Running everything locally

### Backend in mock mode (no GPU)

To develop the frontend without turning on the pod (and without burning GPU hours), the backend supports `MOCK_MODEL=1`: it skips loading `tribev2`/`torch` entirely and returns fake results shaped like the real ones.

```bash
cd backend
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt   # installs fastapi/uvicorn (and torchaudio, which pulls in torch as a dependency)
MOCK_MODEL=1 uvicorn main:app --reload --port 8000
```

```bash
curl http://localhost:8000/health
# {"status": "ok", "model_loaded": true}
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Edit .env.local: NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

Open `http://localhost:3000`, upload a test video, and you'll see the full flow (queued → processing → result) using simulated data.

---

## 📡 Backend endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/health` | `{"status": "ok", "model_loaded": bool}` |
| `POST` | `/analyze` | Multipart, `video` field (mp4/mov, max 200MB). Responds immediately with `{"job_id": str}`. |
| `GET` | `/jobs/{job_id}` | `{"status": "queued\|processing\|done\|error", "result": {...} \| null, "error": str \| null}` |

`result` looks like:

```json
{
  "score": 72,
  "activation_timeline": [0.12, 0.15, "..."],
  "stats": {
    "mean_activation": 0.0123,
    "std_activation": 0.98,
    "max_activation": 4.2,
    "min_activation": -3.9,
    "n_timesteps": 120,
    "n_vertices": 20484
  },
  "duration_s": 178.8
}
```

`score` is a documented placeholder in `backend/scoring.py` (mean + standard deviation of global activation, normalized 0-100) — it's marked with a `TODO` to refine it with specific ROIs (regions of interest) once there's a validated scientific specification.

## 🔑 Environment variables

**Backend** (`backend/.env.example`):

- `ALLOWED_ORIGINS` — comma-separated CORS origins, or `*` (default).
- `HF_HOME` — HuggingFace cache directory.
- `UPLOAD_DIR` — temporary directory for uploaded videos.
- `MOCK_MODEL` — `1` for local development without a GPU.

**Frontend** (`frontend/.env.local.example`):

- `NEXT_PUBLIC_API_URL` — backend URL (RunPod proxy in production, `localhost:8000` locally).
