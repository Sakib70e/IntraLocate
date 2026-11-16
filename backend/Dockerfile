
# IntraLocate API - Render Cloud Dockerfile
FROM oven/bun:1.1.20-alpine

WORKDIR /app

# Install OpenSSL required by Prisma
RUN apk add --no-cache openssl

# Install dependencies
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile || bun install

# Copy source code and Prisma schema
COPY . .

# Generate Prisma client
RUN bunx prisma generate

# Application settings
EXPOSE 3000
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Start backend
CMD ["bun", "run", "src/index.js"]
