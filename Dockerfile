# ScribeAI API image.
#
# The heavy part is docling, which pulls torch + torchvision. The CPU-only
# torch wheels are installed first and separately so that (a) the CUDA wheels
# never get downloaded — they are several GB — and (b) this layer stays cached
# across normal code changes.

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    # FastEmbed caches the BGE model here. On a fresh machine the first request
    # downloads ~65 MB; pointing this at the mounted volume keeps it across
    # restarts instead of re-downloading each deploy.
    FASTEMBED_CACHE_PATH=/data/fastembed \
    HF_HOME=/data/huggingface \
    BILLING_DB=/data/billing.db

WORKDIR /app

# libgomp1 is required by onnxruntime (FastEmbed); the rest are docling's
# document-parsing dependencies.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 \
        libglib2.0-0 \
        libgl1 \
    && rm -rf /var/lib/apt/lists/*

# CPU-only torch first, so the generic index never resolves a CUDA build.
RUN pip install --index-url https://download.pytorch.org/whl/cpu \
        torch==2.5.1 torchvision==0.20.1

COPY api/requirements.txt ./api/requirements.txt
RUN pip install -r api/requirements.txt

COPY api/ ./api/

EXPOSE 8000

# One worker: the SQLite billing state and the in-process FastEmbed model are
# both cheaper to keep single-threaded than to coordinate across processes.
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
