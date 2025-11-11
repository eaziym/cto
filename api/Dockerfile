FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY api/package.json api/tsconfig.json api/tsconfig.build.json api/

RUN pnpm install --filter ./api... --prod=false

COPY api ./api

WORKDIR /app/api
RUN pnpm build && \
    ls -la /app/api/dist || echo "Build failed - dist not created"

FROM node:20-alpine AS runner
WORKDIR /app
RUN corepack enable

# Copy workspace configuration
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Create api directory and copy package.json
RUN mkdir -p api
COPY --from=base /app/api/package.json ./api/package.json

# Install production dependencies with workspace awareness
RUN pnpm install --filter ./api... --prod

# Copy built code and resources
COPY --from=base /app/api/dist ./api/dist
COPY --from=base /app/api/resources ./api/resources

ENV NODE_ENV=production
WORKDIR /app/api

EXPOSE 8080
CMD ["node", "dist/index.js"]
