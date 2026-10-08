FROM node:24-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run check && npm run build

FROM ghcr.io/astral-sh/uv:0.10.12 AS uv
FROM python:3.14.5-slim-bookworm AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src/ src/
RUN uv sync --frozen --no-dev

FROM python:3.14.5-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends util-linux ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 corecontracts \
    && useradd --uid 10001 --gid 10001 --no-create-home corecontracts
WORKDIR /app
COPY --from=build /app /app
COPY --from=frontend /build/dist /app/frontend
COPY migrations/ /app/migrations/
COPY core_contracts/rootfs/entrypoint.sh /entrypoint.sh
RUN chmod 0755 /entrypoint.sh
ENV PATH="/app/.venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
EXPOSE 8787 8099
HEALTHCHECK --interval=30s --timeout=5s CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8787/health/live', timeout=3)"]
ENTRYPOINT ["/entrypoint.sh"]
