# Use official Node.js LTS version
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package files first (for caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the code
COPY . .

# Expose port (optional, in case you use webhooks or express server)
EXPOSE 8080

# Start the bot
CMD ["npm", "start"]
