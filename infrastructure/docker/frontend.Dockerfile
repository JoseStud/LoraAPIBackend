FROM node:20

# Set working dir
WORKDIR /app

# Copy package manifests first to leverage Docker layer caching
COPY app/frontend/package.json ./
COPY app/frontend/package-lock.json* ./

# Install dependencies at build time for consistency
RUN npm ci --production=false || npm install

# Copy rest of the source
COPY . /app

# Expose dev server port
EXPOSE 3000

# Default command is the dev script; Compose overrides this for install+dev
CMD ["npm", "run", "dev"]
