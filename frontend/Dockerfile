# Builder stage
FROM oven/bun:1-slim AS builder

WORKDIR /app

# Install dependencies first (for better caching)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy the rest of the source code
COPY . .

# Build-time argument for the API URL
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG BACKEND_HOSTNAME
ENV BACKEND_HOSTNAME=$BACKEND_HOSTNAME

# Build the Next.js application
RUN bun run build

# Runner stage
FROM oven/bun:1-slim AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy built assets and necessary files from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/next.config.ts ./next.config.ts

# Expose the app port
EXPOSE 3000

# Start the application
CMD ["bun", "run", "start"]
