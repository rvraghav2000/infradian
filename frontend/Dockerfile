FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Expose the Vite dev port
EXPOSE 3000

# Run Vite on port 3000 with host mapping for Docker access
CMD ["npm", "run", "dev", "--", "--host", "--port", "3000"]
