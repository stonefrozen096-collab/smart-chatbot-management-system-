# Code Reference Guide - v1.1.0

## Quick Navigation to Key Implementation Areas

### 1. Server.js - Backend Implementation

#### Authentication & Token Rotation
- **Line 1119-1180:** POST /api/auth/login - Login endpoint with token generation
- **Line 1182-1230:** POST /api/auth/refresh - Token refresh with rotation
- **Line 1335-1355:** POST /api/auth/logout - Logout endpoint with token revocation

#### Password Reset System
- **Line 1232-1300:** POST /api/auth/password-reset/request - OTP generation
- **Line 1302-1320:** POST /api/auth/password-reset/verify-identity - Identity verification
- **Line 1322-1350:** POST /api/auth/password-reset/complete - Complete password reset

#### Audit Logging System
- **Line 452-464:** `logAudit()` function - Global audit logging helper
- **Line 1054:** Feature toggle logging
- **Line 1244, 1275, 1325:** Password reset action logging
- **Line 1774, 1795:** HC grant/broadcast logging
- **Line 2641, 2662:** Lock/unlock logging
- **Line 2570-2574:** Warning issue logging
- **Line 2605:** Warning removal logging
- **Line 3166, 3179:** Promotion/revocation logging

#### Audit Logs Endpoints
- **Line ~2870:** GET /api/admin/audit-logs - Admin audit logs (200 limit)
- **Line ~2890:** GET /api/super-admin/audit-logs - Super admin audit logs (500 limit)

#### Database Schema Changes
- **Line ~650-700:** Student schema with OTP fields added:
  - `passwordResetOTP`
  - `otpExpiresAt`
  - `otpVerified`

---

### 2. Frontend Files

#### index.html - Login Page
- **Line 40-45:** Login form section
- **Line 43:** "Forgot Password?" link → password-reset.html

#### student.html - Token Management
- **Line ~100-150:** Global fetch wrapper with auto-refresh
- **Line ~200-250:** getRefreshToken() helper function
- **Line ~300-350:** Token update logic on refresh

#### admin.html - Audit Logs UI
- **Line ~340-380:** Audit logs section HTML with table
- **Line ~360-365:** Filter buttons (All, Locks, Warnings, HC, Features)

#### admin.js - Audit Functions
- **Line ~100-150:** loadAuditLogs() - Fetch audit logs from API
- **Line ~150-200:** renderAuditLogs() - Display logs in table
- **Line ~200-250:** filterAuditLogs() - Filter by action type
- **Line ~250-300:** getActionBadge() - Color-coded badge generation
- **Line ~400-500:** secureFetch() with token refresh logic

#### super-admin.html - Audit Logs Enhanced
- **Line ~345-385:** Audit logs section with table and filters
- **Line ~660-740:** loadAuditLogs() and filter functions

#### password-reset.html (NEW FILE)
- **Line 1-50:** HTML header and styling
- **Line 50-120:** Step 1 - Request OTP form
- **Line 120-180:** Step 2 - Verify identity form
- **Line 180-240:** Step 3 - Display OTP with timer
- **Line 240-300:** Step 4 - Complete password reset form
- **Line 300-350:** JavaScript functions for form handling
- **Line 350-400:** API call functions
- **Line 400-450:** OTP countdown timer logic

---

### 3. Key Variables & Configuration

#### In server.js:
```javascript
// Token validity
const ACCESS_TOKEN_EXPIRY = "15m"     // 15 minutes
const REFRESH_TOKEN_EXPIRY = "30d"    // 30 days

// OTP Configuration
const OTP_EXPIRY = 10 * 60 * 1000      // 10 minutes
const OTP_LENGTH = 6                   // 6 digits
```

#### In config.js:
```javascript
const API = 'http://localhost:3000'   // API endpoint
```

---

### 4. API Endpoints Summary

#### Authentication (3 endpoints)
```
POST /api/auth/login
  Body: { roll, password }
  Returns: { accessToken, refreshToken, csrfToken, student }

POST /api/auth/refresh
  Body: { refreshToken }
  Returns: { accessToken, refreshToken }

POST /api/auth/logout
  Body: { refreshToken }
  Returns: { ok: true }
```

#### Password Reset (3 endpoints)
```
POST /api/auth/password-reset/request
  Body: { roll }
  Returns: { otp, message }

POST /api/auth/password-reset/verify-identity
  Body: { roll, currentPassword }
  Returns: { ok: true }

POST /api/auth/password-reset/complete
  Body: { roll, otp, newPassword }
  Returns: { ok: true }
```

#### Audit Logs (2 endpoints)
```
GET /api/admin/audit-logs?limit=200
  Returns: [{ admin, action, details, timestamp }, ...]

GET /api/super-admin/audit-logs?limit=500
  Returns: [{ admin, action, details, timestamp }, ...]
```

---

### 5. MongoDB Collections

#### Students Collection - New Fields
```javascript
{
  passwordResetOTP: String,      // 6-digit code
  otpExpiresAt: Date,            // Expiration time
  otpVerified: Boolean,          // Identity verification flag
  refreshTokens: [{              // Array of refresh token records
    tokenId: String,
    expiresAt: Date
  }]
}
```

#### New AuditLog Collection
```javascript
{
  _id: ObjectId,
  admin: String,                 // Admin/user roll number
  action: String,                // Action type
  details: String,               // Description
  timestamp: Date,               // When action occurred
  createdAt: Date                // Auto-created
}
```

---

### 6. Action Types in Audit Logs

Supported actions for filtering:
```
LOGIN                  - User logged in
LOGOUT                 - User logged out
PASSWORD_RESET_REQUEST - OTP requested for password reset
PASSWORD_RESET_IDENTITY_VERIFIED - Identity verified
PASSWORD_RESET_COMPLETE - Password reset completed
LOCK_STUDENT           - Student account locked
UNLOCK_STUDENT         - Student account unlocked
WARNING                - Warning issued
AUTO_LOCK              - Automatic lock after 3 warnings
WARNING_REMOVED        - Warning removed by admin
GRANT_HC               - HC granted to student
BROADCAST_HC           - HC broadcast to all students
FEATURE_TOGGLE         - Feature enabled/disabled
PROMOTE                - User promoted to admin
REVOKE                 - Admin privileges revoked
```

---

### 7. Frontend Storage Keys

#### localStorage/sessionStorage Keys
```javascript
'accessToken'          // JWT access token (15-min validity)
'refreshToken'         // JWT refresh token (30-day validity)
'csrfToken'           // CSRF token for state-changing requests
```

---

### 8. Color Coding for Action Badges

```javascript
LOCK         → #ef4444 (Red)
UNLOCK       → #10b981 (Green)
WARNING      → #f59e0b (Orange)
HC           → #10b981 (Green)
PROMOTE      → #f97316 (Orange)
FEATURE      → #8b5cf6 (Purple)
PASSWORD     → #6366f1 (Blue)
LOGIN        → #3b82f6 (Light Blue)
LOGOUT       → #6b7280 (Gray)
```

---

### 9. Error Messages

#### Login Page
```
"All fields required!"
"Invalid credentials"
"Account is locked"
"Account locked" (Redis)
```

#### Password Reset
```
"Student not found"
"Invalid current password"
"Invalid OTP"
"OTP expired"
"Password must be 8+ chars, include number & uppercase!"
"Passwords do not match"
"Password reset successful"
```

#### Audit Logs
```
"Failed to load audit logs"
"No audit logs found"
```

---

### 10. Testing Command Reference

#### Check syntax
```bash
node -c server.js
```

#### Start server
```bash
npm start
```

#### Test API endpoints
```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"roll":"001","password":"Password123"}'

# Password reset request
curl -X POST http://localhost:3000/api/auth/password-reset/request \
  -H "Content-Type: application/json" \
  -d '{"roll":"001"}'

# Get audit logs
curl http://localhost:3000/api/admin/audit-logs \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 11. Browser DevTools Tips

#### Check Token Storage
```javascript
// In browser console:
console.log(localStorage.getItem('accessToken'))
console.log(localStorage.getItem('refreshToken'))
console.log(localStorage.getItem('csrfToken'))
```

#### Test Token Expiry
```javascript
// Decode JWT (need jwt-decode library):
const decoded = jwt_decode(localStorage.getItem('accessToken'))
console.log(new Date(decoded.exp * 1000))
```

#### Monitor API Calls
```
Network Tab → Filter by XHR
Look for:
- /api/auth/login (returns tokens)
- /api/auth/refresh (token rotation)
- /api/admin/audit-logs (fetch audit logs)
- /api/auth/password-reset/* (password reset flow)
```

---

### 12. Security Checklist

- [x] CSRF tokens required on state-changing requests
- [x] Password hashed with bcrypt
- [x] OTP expires after 10 minutes
- [x] Access tokens expire after 15 minutes
- [x] Refresh tokens expire after 30 days
- [x] Audit logs are immutable (append-only)
- [x] Sensitive operations logged
- [x] Role-based access control maintained
- [x] Input validation on all endpoints
- [x] Error messages don't expose sensitive info

---

## Quick Links

**Documentation:**
- RECENT_UPDATES_v1.1.0.md - Complete feature documentation
- QUICK_TEST_v1.1.0.md - Testing guide with step-by-step instructions
- This file - Code reference guide

**Key Files:**
- server.js - Backend API
- password-reset.html - Password reset UI
- admin.html/admin.js - Admin dashboard
- super-admin.html - Super admin dashboard

**Testing:**
- Browser DevTools (Network, Application tabs)
- MongoDB shell for checking audit logs
- curl commands for API testing

---

**Version:** 1.1.0
**Last Updated:** 2024
**Status:** Production Ready
