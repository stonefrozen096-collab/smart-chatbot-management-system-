# Smart Chatbot Management System

A comprehensive student chatbot management system with AI integration using Google's Gemini AI. This system provides student authentication, chat history management, administrative controls, and real-time notifications.

## Features

- 🔐 **Secure Authentication** - JWT-based authentication with refresh tokens
- 🤖 **AI-Powered Chat** - Integration with Google Gemini AI
- 👥 **Student Dashboard** - Profile management, chat history, warnings, and notices
- 🛡️ **Admin Panel** - Manage students, locks, warnings, and system-wide controls
- 🔔 **Real-time Updates** - Socket.IO for instant notifications
- 📊 **Analytics Dashboard** - Track usage statistics and student activity
- 🔒 **Account Locks & Warnings** - Manage student behavior and access control
- 🎨 **Customizable UI** - Theme settings and personalization options

## Tech Stack

### Backend
- **Node.js** with Express.js
- **MongoDB** with Mongoose ODM
- **Socket.IO** for real-time communication
- **Redis** for rate limiting and distributed locking (optional)
- **JWT** for authentication
- **Helmet** for security headers
- **CORS** for cross-origin requests
- **Bcrypt** for password hashing
- **Joi** for validation

### Frontend
- **HTML5/CSS3** with modern styling
- **Vanilla JavaScript** (ES6+)
- **Socket.IO Client** for real-time features
- **Responsive Design** for mobile and desktop

## Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** (v16 or higher)
- **MongoDB** (v5 or higher) - Running locally or MongoDB Atlas
- **Redis** (optional, for advanced features)
- **npm** or **yarn** package manager

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd smart-chatbot-management-system-
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# MongoDB Connection
MONGO_URI=mongodb://localhost:27017/student-chatbot

# JWT Secrets (Change these in production!)
JWT_ACCESS_SECRET=your_super_secret_access_key_change_me_in_production
JWT_REFRESH_SECRET=your_super_secret_refresh_key_change_me_in_production

# Gemini AI Configuration (Optional)
GEMINI_API_URL=https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro-latest:generateContent
GEMINI_API_KEY=your_gemini_api_key_here

# Redis Configuration (Optional but recommended)
REDIS_URL=redis://localhost:6379

# Admin API Key (Server-only secret)
ADMIN_API_KEY=your_admin_api_key_change_me_in_production

# Server Configuration
PORT=5000
NODE_ENV=development
```

### 4. Set Up MongoDB

#### Option A: Local MongoDB
```bash
# Install MongoDB on your system
# Start MongoDB service
mongod --dbpath /path/to/data/directory
```

#### Option B: MongoDB Atlas (Cloud)
1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a new cluster
3. Get your connection string and update `MONGO_URI` in `.env`

### 5. Set Up Redis (Optional)

```bash
# Install Redis on your system
# Start Redis service
redis-server
```

### 6. Get Google Gemini API Key (Optional)

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Generate an API key
3. Update `GEMINI_API_KEY` in `.env`

## Running the Application

### Development Mode

```bash
npm run dev
```

This will start the server with nodemon, which automatically restarts on file changes.

### Production Mode

```bash
npm start
```

The server will start on `http://localhost:5000` (or the PORT specified in `.env`)

## Project Structure

```
smart-chatbot-management-system-/
├── server.js               # Main server file with all API routes
├── package.json            # Project dependencies
├── .env                    # Environment variables (create this)
├── .gitignore             # Git ignore file
├── README.md              # This file
│
├── index.html             # Login/Signup page
├── student.html           # Student dashboard
├── admin.html             # Admin dashboard
├── chatbot.html           # Chat interface
├── settings.html          # User settings page
├── student-form.html      # Student form page
│
└── (optional client-side JS files)
    ├── api.js             # API helper functions
    ├── chatbot.js         # Chat logic
    └── admin.js           # Admin logic
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new student
- `POST /api/auth/login` - Login with roll number and password
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout and revoke refresh token

### CSRF Protection
- `GET /api/csrf-token` - Get CSRF token for protected routes

### Student
- `GET /api/student/:roll` - Get student profile by roll number
- `GET /api/me` - Get current user profile
- `PATCH /api/student/:roll` - Update student profile
- `DELETE /api/student/:roll` - Delete student account

### Chat
- `POST /api/chat` - Send a message to the chatbot
- `GET /api/chat/history/:roll` - Get chat history for a student

### Admin
- `GET /api/admin/students` - List all students (admin only)
- `POST /api/admin/lock/:roll` - Lock a student account
- `POST /api/admin/unlock/:roll` - Unlock a student account
- `POST /api/admin/warning/:roll` - Issue a warning to student
- `GET /api/admin/warnings/:roll` - Get warnings for student
- `POST /api/admin/notice` - Create a system-wide notice
- `GET /api/notices` - Get all notices

### Dashboard
- `GET /api/dashboard/status` - Get dashboard data (warnings, locks, usage stats)

## Usage

### For Students

1. **Sign Up**: Navigate to the homepage and create an account
2. **Login**: Enter your roll number and password
3. **Dashboard**: View your profile, chat history, warnings, and notices
4. **Chat**: Click "Open Chat" to interact with the AI chatbot
5. **Settings**: Customize your theme and preferences

### For Admins

1. **Login**: Use admin credentials to access the admin panel
2. **Manage Students**: View, lock, unlock, or delete student accounts
3. **Issue Warnings**: Send warnings to students
4. **Post Notices**: Create system-wide announcements
5. **Monitor Activity**: View usage statistics and chat logs

## Security Features

- ✅ **JWT Authentication** with access and refresh tokens
- ✅ **CSRF Protection** using double-submit cookie pattern
- ✅ **Password Hashing** with bcrypt (12 rounds)
- ✅ **Rate Limiting** using Redis
- ✅ **Helmet.js** for security headers
- ✅ **Input Validation** using Joi
- ✅ **XSS Protection** with sanitization
- ✅ **CORS Configuration** for cross-origin requests

## Troubleshooting

### MongoDB Connection Error
- Ensure MongoDB is running
- Check `MONGO_URI` in `.env` file
- Verify network connectivity to MongoDB

### Redis Connection Error
- Redis is optional; the app will work without it
- To enable Redis features, ensure Redis is running
- Check `REDIS_URL` in `.env` file

### JWT Errors
- Verify `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are set
- Ensure tokens haven't expired
- Clear browser cache and login again

### Port Already in Use
- Change `PORT` in `.env` file
- Or kill the process using the port: `lsof -ti:5000 | xargs kill -9`

## Development

### Adding New Features

1. Create new routes in `server.js`
2. Update corresponding HTML files
3. Test thoroughly with different user roles
4. Update this README with new features

### Database Schema

**Student Model:**
- roll (unique identifier)
- name, dept, cls, email
- passwordHash
- role (student/admin)
- settings (theme, notifications, etc.)
- refreshTokens (for JWT rotation)
- locks and warnings

**ChatHistory Model:**
- roll (student identifier)
- sender (student/assistant/system)
- message
- timestamp

**Warning Model:**
- roll, issuerRoll, reason, level
- expiresAt

**Lock Model:**
- roll, reason, lockedBy
- expiresAt

**Notice Model:**
- title, body, createdBy
- urgent flag

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature-name`
5. Submit a pull request

## License

MIT License - See LICENSE file for details

## Author

Hari Prasath

## Support

For issues and questions, please open an issue on GitHub or contact the maintainer.

---

**Note**: This is a development version. For production deployment:
- Use strong, unique secrets for JWT and Admin API keys
- Enable HTTPS
- Configure proper CORS origins
- Set up proper Redis and MongoDB clusters
- Implement additional security measures
- Use environment-specific configurations