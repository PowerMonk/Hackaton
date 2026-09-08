# Morelia Conecta Backend
FROM oven/bun:1.1-alpine

WORKDIR /app

# Install dependencies first (for caching)
COPY package.json ./
RUN bun install

# Copy source files
COPY src ./src
COPY scripts ./scripts
COPY db ./db

# Create data directory
RUN mkdir -p /app/data/geojson

# Environment
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

# Use entrypoint script
COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
