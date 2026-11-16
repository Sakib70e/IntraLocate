# IntraLocate API - Render Cloud Dockerfile (Bun runtime)
FROM oven/bun:1.1.20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile || bun install

# Copy source code and Prisma schema
COPY . .

# Generate Prisma client
RUN bunx prisma generate

# Expose default application port
EXPOSE 3000

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Start Elysia backend server
CMD ["bun", "run", "src/index.js"]
