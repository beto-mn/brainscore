#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# provision_pod.sh — Provisioning completo de un pod de RunPod para BrainScore
# ============================================================================
# Idempotente: se puede correr N veces sin romper nada. Úsalo:
#   - Al crear un pod nuevo desde cero (template: RunPod PyTorch 2.8.0)
#   - Después de cada Stop/Start (el container disk se borra; /workspace no)
#
# Uso:
#   bash provision_pod.sh                    # interactivo (pide token HF si falta)
#   HF_TOKEN=hf_xxx bash provision_pod.sh    # no-interactivo (para automatizar)
#   bash provision_pod.sh --start            # además levanta el API al final
#
# Requisitos del pod (se configuran en la consola de RunPod al crearlo):
#   - Template: RunPod PyTorch 2.8.0 (runpod/pytorch:*-torch280-*)
#   - Volumen persistente de 50GB montado en /workspace
#   - Puertos HTTP expuestos: 8888 (Jupyter) y 8000 (API)
#   - Tu llave SSH pública registrada en Settings → SSH Public Keys
#     (ANTES de crear/arrancar el pod, si no authorized_keys queda en "null")
# ============================================================================

REPO_URL="${REPO_URL:-https://github.com/beto-mn/brainscore.git}"
REPO_DIR="/workspace/brainscore"
TRIBE_DIR="/workspace/tribev2"
HF_CACHE="/workspace/hf_cache"

# Pins descubiertos a la mala (torch 2.8 viene en la imagen del template):
#   torch 2.8  <->  torchvision 0.23  <->  torchaudio 2.8
# Si cambias de template/torch, actualiza este trío completo.
TORCHVISION_PIN="0.23.0"
TORCHAUDIO_PIN="2.8.0"
NUMPY_PIN="numpy<2.1"   # numba requiere <2.1; tribev2 arrastra numpy nuevo si no se pinea

log()  { echo -e "\n\033[1;35m==> $*\033[0m"; }
ok()   { echo -e "\033[1;32m ✓ $*\033[0m"; }
fail() { echo -e "\033[1;31m ✗ $*\033[0m"; exit 1; }

# ----------------------------------------------------------------------------
log "1/8 Variables de entorno persistentes (TERM + HF_HOME + HF_HUB_ENABLE_HF_TRANSFER)"
# ----------------------------------------------------------------------------
# TERM: terminales modernas (Ghostty, kitty...) anuncian un TERM que el pod no
# conoce y tmux se niega a arrancar ("missing or unsuitable terminal").
grep -q "TERM=xterm-256color" ~/.bashrc 2>/dev/null || \
  echo 'export TERM=xterm-256color' >> ~/.bashrc
export TERM=xterm-256color

# HF_HOME: los pesos (~10-15GB) deben vivir en el volumen para sobrevivir Stops.
grep -q "HF_HOME=" ~/.bashrc 2>/dev/null || \
  echo "export HF_HOME=${HF_CACHE}" >> ~/.bashrc
export HF_HOME="${HF_CACHE}"
mkdir -p "${HF_CACHE}"

# HF_HUB_ENABLE_HF_TRANSFER: algunos templates de RunPod la traen en 1 para
# acelerar descargas de HuggingFace, pero tribev2 invoca whisperx en un
# entorno aislado (uv) que no trae el paquete hf_transfer instalado. Con la
# variable en 1 esa descarga revienta con "hf_transfer package is not
# available" antes de transcribir el audio. La forzamos a 0 (descarga normal,
# más lenta pero sin esa dependencia extra).
grep -q "HF_HUB_ENABLE_HF_TRANSFER=0" ~/.bashrc 2>/dev/null || \
  echo 'export HF_HUB_ENABLE_HF_TRANSFER=0' >> ~/.bashrc
export HF_HUB_ENABLE_HF_TRANSFER=0
ok "TERM, HF_HOME y HF_HUB_ENABLE_HF_TRANSFER configurados"

# ----------------------------------------------------------------------------
log "2/8 Repo de la app en el volumen persistente"
# ----------------------------------------------------------------------------
# OJO: siempre rutas absolutas bajo /workspace. Un 'cd workspace' sin slash
# crea un clon fantasma en /root/workspace que se borra con cada Stop.
if [ -d "${REPO_DIR}/.git" ]; then
  ok "Repo ya existe, actualizando (git pull)"
  git -C "${REPO_DIR}" pull --ff-only || echo " (pull falló, continuando con lo local)"
else
  git clone "${REPO_URL}" "${REPO_DIR}"
  ok "Repo clonado en ${REPO_DIR}"
fi

# ----------------------------------------------------------------------------
log "3/8 tribev2 (Meta FAIR) en el volumen"
# ----------------------------------------------------------------------------
if [ -d "${TRIBE_DIR}/.git" ]; then
  ok "tribev2 ya clonado"
else
  git clone https://github.com/facebookresearch/tribev2.git "${TRIBE_DIR}"
fi
# pip install -e vive en el container disk -> se re-corre en cada provision.
pip install -e "${TRIBE_DIR}" -q
ok "tribev2 instalado (editable)"

# ----------------------------------------------------------------------------
log "4/8 Dependencias del backend + nltk"
# ----------------------------------------------------------------------------
pip install -r "${REPO_DIR}/backend/requirements.txt" -q
pip install nltk -q   # fix: setup original no lo traía y punkt_tab tronaba
ok "requirements + nltk instalados"

# ----------------------------------------------------------------------------
log "5/8 Alineación de la familia torch (los eternos mismatches)"
# ----------------------------------------------------------------------------
# El pip install de arriba puede pisar torchvision/torchaudio con versiones
# compiladas contra otro torch. Sintomas conocidos:
#   - "operator torchvision::nms does not exist"
#   - "undefined symbol: aoti_torch_abi_version" (torchaudio)
# El fix: forzar las versiones pareja de torch SIN tocar torch (--no-deps).
pip install "${NUMPY_PIN}" -q
pip install "torchvision==${TORCHVISION_PIN}" --force-reinstall --no-deps -q
pip install "torchaudio==${TORCHAUDIO_PIN}" --force-reinstall --no-deps -q
ok "numpy/torchvision/torchaudio pineados"

# ----------------------------------------------------------------------------
log "6/8 Recursos de NLTK (punkt_tab, lo usa whisperx para alinear)"
# ----------------------------------------------------------------------------
python -c "import nltk; nltk.download('punkt_tab', quiet=True)"
ok "punkt_tab descargado"

# ----------------------------------------------------------------------------
log "7/8 Autenticación Hugging Face (Llama-3.2-3B es repo gated)"
# ----------------------------------------------------------------------------
# El token queda en HF_HOME (volumen), así que sobrevive Stops. Solo se pide
# la primera vez o tras un Terminate.
if python -c "from huggingface_hub import whoami; whoami()" >/dev/null 2>&1; then
  ok "Ya hay sesión de HF activa"
elif [ -n "${HF_TOKEN:-}" ]; then
  python -c "from huggingface_hub import login; login(token='${HF_TOKEN}')"
  ok "Login con HF_TOKEN de entorno"
else
  echo "   Se requiere login de Hugging Face (cuenta con acceso a meta-llama/Llama-3.2-3B)."
  hf auth login   # nota: 'huggingface-cli login' está deprecado
fi

# ----------------------------------------------------------------------------
log "8/8 Verificación final"
# ----------------------------------------------------------------------------
python - <<'PY'
import torch, torchvision, torchaudio, numpy, nltk.data
print(f"   torch       {torch.__version__}")
print(f"   torchvision {torchvision.__version__}")
print(f"   torchaudio  {torchaudio.__version__}")
print(f"   numpy       {numpy.__version__}")
from torchvision.ops import nms
print("   torchvision::nms OK")
nltk.data.find('tokenizers/punkt_tab')
print("   punkt_tab OK")
assert torch.cuda.is_available(), "CUDA no disponible!"
print(f"   GPU: {torch.cuda.get_device_name(0)}")
PY
ok "Provisioning completo"

# ----------------------------------------------------------------------------
# Arranque opcional del API
# ----------------------------------------------------------------------------
if [ "${1:-}" = "--start" ]; then
  log "Levantando API (tmux 'api')"
  bash "${REPO_DIR}/backend/start.sh"
  echo ""
  echo "   Logs:   tmux attach -t api   (Ctrl+B, D para salir)"
  echo "   Health: curl https://<pod-id>-8000.proxy.runpod.net/health"
else
  echo ""
  echo "Para levantar el API:  bash ${REPO_DIR}/backend/start.sh"
fi

echo ""
echo "Recordatorios post-arranque del pod:"
echo "  - La IP/puerto SSH pueden haber cambiado -> actualizar ~/.ssh/config local"
echo "  - Los secrets RUNPOD_SSH_HOST/PORT de GitHub Actions -> mismos valores"
echo "  - La URL del proxy :8000 puede cambiar -> NEXT_PUBLIC_API_URL en Vercel"
echo "  - Apagar con STOP (nunca Terminate: borra /workspace y los pesos)"
