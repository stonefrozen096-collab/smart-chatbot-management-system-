#!/bin/bash

# Smart Chatbot Management System - Setup Script
echo "====================================="
echo "Smart Chatbot Setup Script"
echo "====================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js v16 or higher."
    exit 1
fi
echo "✅ Node.js version: $(node --version)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm."
    exit 1
fi
echo "✅ npm version: $(npm --version)"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Check if .env exists
if [ ! -f .env ]; then
    echo ""
    echo "⚠️  .env file not found. Creating from template..."
    cat > .env << 'EOF'
# MongoDB Connection
# For local MongoDB (requires MongoDB running):
# MONGO_URI=mongodb://localhost:27017/student-chatbot
# For MongoDB Atlas (recommended - replace with your connection string):
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/student-chatbot?retryWrites=true&w=majority

# JWT Secrets (CHANGE THESE IN PRODUCTION!)
JWT_ACCESS_SECRET=$(openssl rand -base64 32)
JWT_REFRESH_SECRET=$(openssl rand -base64 32)

# Gemini AI Configuration (Optional - get from https://makersuite.google.com/app/apikey)
GEMINI_API_URL=https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro-latest:generateContent
GEMINI_API_KEY=your_gemini_api_key_here

# Redis Configuration (Optional but recommended for production)
# REDIS_URL=redis://localhost:6379

# Admin API Key (Server-only secret - CHANGE IN PRODUCTION!)
ADMIN_API_KEY=$(openssl rand -base64 32)

# Server Configuration
PORT=5000
NODE_ENV=development
EOF
    echo "✅ Created .env file with random secrets"
else
    echo "✅ .env file exists"
fi

echo ""
echo "====================================="
echo "Setup Complete!"
echo "====================================="
echo ""
echo "📝 Next steps:"
echo ""
echo "1. Update MongoDB connection in .env file:"
echo "   - For local: Install MongoDB and use mongodb://localhost:27017/student-chatbot"
echo "   - For cloud: Get MongoDB Atlas connection string"
echo ""
echo "2. (Optional) Get Google Gemini API key:"
echo "   - Visit: https://makersuite.google.com/app/apikey"
echo "   - Update GEMINI_API_KEY in .env"
echo ""
echo "3. Start the server:"
echo "   - Development: npm run dev"
echo "   - Production: npm start"
echo ""
echo "4. Open your browser:"
echo "   - Navigate to: http://localhost:5000"
echo ""
echo "====================================="
