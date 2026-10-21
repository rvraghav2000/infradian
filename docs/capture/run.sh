#!/usr/bin/env bash
# Regenerate docs/img/*.png and demo.gif. Needs: Docker, the app running (frontend :5173, backend :8000).
set -euo pipefail
cd "$(dirname "$0")/../.."
docker run --rm --add-host=host.docker.internal:host-gateway \
  -v "$PWD/docs/capture:/capture:ro" -v "$PWD/docs/img:/out" \
  mcr.microsoft.com/playwright/python:v1.49.1-jammy \
  bash -c "pip install -q playwright==1.49.1 pillow && python /capture/capture.py"
