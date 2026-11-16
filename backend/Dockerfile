
# IntraLocate API - Render
FROM oven/bun:1.4.4

WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile || bun install

# Copy backend source
COPY . .

# Generate Prisma client
RUN bunx prisma generate

# Server configuration
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "run", "src/index.js"]
