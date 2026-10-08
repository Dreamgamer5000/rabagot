# Builder stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies using npm (reliable and robust in Docker)
COPY package.json ./
RUN npm install

# Copy the rest of the source code
COPY . .

# Build-time arguments with default fallbacks
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG BACKEND_HOSTNAME=picshare-backend:8000
ENV BACKEND_HOSTNAME=$BACKEND_HOSTNAME
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID
ENV NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID
ARG NEXT_PUBLIC_UMAMI_SCRIPT_URL=https://cloud.umami.is/script.js
ENV NEXT_PUBLIC_UMAMI_SCRIPT_URL=$NEXT_PUBLIC_UMAMI_SCRIPT_URL

# Build the Next.js application
RUN npm run build

# Runner stage
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy built assets and required files
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/next.config.ts ./next.config.ts

# Expose the app port
EXPOSE 3000

# Start Next.js
CMD ["npm", "run", "start"]
