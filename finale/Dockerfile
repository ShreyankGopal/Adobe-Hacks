# ---------- Stage 1: Frontend build ----------
    FROM node:18 AS frontend
    WORKDIR /frontend
    
    # Install dependencies first (cached)
    COPY package.json package-lock.json ./
    RUN npm ci --legacy-peer-deps
    
    # Copy frontend sources
    COPY src ./src
    COPY index.html ./
    COPY vite.config.* ./
    COPY tailwind.config.* ./
    COPY postcss.config.js ./
    COPY tsconfig*.json ./
    
    # Build frontend
    ARG ADOBE_EMBED_API_KEY
    ENV VITE_ADOBE_CLIENT_ID=${ADOBE_EMBED_API_KEY}
    RUN npm install
    RUN npm run build
    
    
    # ---------- Stage 2: Backend + Supervisor ----------
    FROM python:3.10-slim
    
    WORKDIR /app
    
    # Install system dependencies
    RUN apt-get update && apt-get install -y --no-install-recommends \
        supervisor ffmpeg libgl1 libglib2.0-0 build-essential curl nodejs npm \
     && rm -rf /var/lib/apt/lists/*
    
    # Backend requirements
    COPY backend/requirements.txt /tmp/requirements.txt
    RUN pip install --no-cache-dir -r /tmp/requirements.txt
    
    # Copy backend code
    COPY backend/ /app/
    
    # Copy built frontend into /app/static
    COPY --from=frontend /frontend/dist /app/static
    
    # Install `serve` to serve frontend build
    RUN npm install -g serve
    
    # Copy supervisor config
    COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
    
    # Expose frontend (8080) and backend (5001)
    EXPOSE 8080 5001
    
    # Start supervisor (runs both backend + frontend)
    CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
    