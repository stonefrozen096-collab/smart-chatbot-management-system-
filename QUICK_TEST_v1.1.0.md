# 🚀 Quick Start Guide - Feature Testing v1.1.0

## 📋 Feature Overview

This release includes 3 major security and UX enhancements:
1. **Refresh Token Rotation** - Automatic token refresh on expiry
2. **Password Reset with OTP** - In-app OTP display and verification
3. **Audit Logging System** - Comprehensive activity monitoring

---

## 🔧 Setup & Prerequisites

### Required
- Node.js 14+
- MongoDB running
- `npm install` completed

### Environment Variables
Ensure `.env` or `server.js` has:
```
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
MONGODB_URI=mongodb://localhost:27017/chatbot
PORT=3000
```

### Start Server
```bash
npm start
# or
node server.js
```

Server should start on `http://localhost:3000`

---

## ✅ Testing Checklist

### Feature 1: Refresh Token Rotation

#### Test 1.1: Normal Login with Token Storage
```
1. Open http://localhost:3000 in browser
2. Click "Login"
3. Enter: Roll=001, Password=Password123
4. Open DevTools → Application → LocalStorage
5. ✓ Should see accessToken and refreshToken stored
```

#### Test 1.2: Automatic Token Refresh
```
1. Login as student
2. Open DevTools → Network tab
3. Make any student action (e.g., toggle feature)
4. After 15 minutes of inactivity, try another action
5. ✓ Should see 401 response followed by /api/auth/refresh
6. ✓ Action should retry and succeed
7. ✓ New tokens should be in localStorage
```

#### Test 1.3: Logout & Token Revocation
```
1. Click Logout button
2. Try using the old token (curl with Authorization header)
3. ✓ Should get 401 Unauthorized
4. ✓ Must login again to get new tokens
```

---

### Feature 2: Password Reset with OTP

#### Test 2.1: Forgot Password Link
```
1. Open http://localhost:3000
2. On login page, look for "Forgot Password?" link
3. ✓ Link should appear below login button
4. Click link → Should navigate to password-reset.html
```

#### Test 2.2: Step 1 - Request OTP
```
Page: password-reset.html
1. Enter Roll Number: 001
2. Click "Generate OTP"
3. ✓ Page should advance to Step 2
4. ✓ No errors in console
```

#### Test 2.3: Step 2 - Verify Identity
```
1. Should see "Verify Your Identity" section
2. Enter current password: Password123
3. Click "Verify Password"
4. ✓ Should see success message
5. ✓ Step 3 should be enabled
```

#### Test 2.4: Step 3 - View OTP
```
1. Should see "Your OTP" section
2. ✓ Should display 6-digit code (e.g., 123456)
3. ✓ Should show countdown timer (10 minutes)
4. ✓ Timer should decrement every second
5. Optional: Click "Regenerate OTP" to get new code
```

#### Test 2.5: Step 4 - Reset Password
```
1. Enter the OTP shown in Step 3
2. Enter new password: NewPassword123
3. Confirm new password: NewPassword123
4. Click "Reset Password"
5. ✓ Should see success message
6. ✓ Should redirect to login
7. ✓ Should be able to login with NEW password
```

#### Test 2.6: Edge Cases
```
Error Case 1: Invalid Roll Number
- Enter: 999999
- ✓ Should show error: "Student not found"

Error Case 2: Wrong Current Password
- Try with incorrect password in Step 2
- ✓ Should show error: "Invalid password"

Error Case 3: Wrong OTP
- In Step 4, enter wrong 6-digit code
- ✓ Should show error: "Invalid OTP"

Error Case 4: Expired OTP
- Wait 10+ minutes before entering OTP
- ✓ Should show error: "OTP expired"

Error Case 5: Weak New Password
- Try password: "weak"
- ✓ Should show error: "Password must be 8+ chars..."
```

---

### Feature 3: Audit Logging System

#### Test 3.1: Admin Dashboard Audit Logs
```
1. Login as admin (roll with admin role)
2. Navigate to admin dashboard
3. Click "Audit Logs" section
4. ✓ Should see table with columns:
   - Timestamp
   - Admin/User
   - Action Type (colored badges)
   - Details
5. ✓ Should see "🔄 Refresh Logs" button
```

#### Test 3.2: Admin Action Logging
```
1. From admin dashboard, perform an action:
   - Lock a student
   - Issue a warning
   - Grant HC
2. Go to Audit Logs section
3. Click "🔄 Refresh Logs"
4. ✓ Your action should appear in logs
5. ✓ Timestamp should be recent
6. ✓ Admin name should be your roll number
```

#### Test 3.3: Filter Buttons
```
Admin Dashboard Audit Logs:
1. Click "Locks" filter
   ✓ Should show only LOCK/UNLOCK actions
2. Click "Warnings" filter
   ✓ Should show only WARNING actions
3. Click "HC" filter
   ✓ Should show only GRANT_HC/BROADCAST_HC
4. Click "Features" filter
   ✓ Should show only FEATURE_TOGGLE
5. Click "All" filter
   ✓ Should show all actions
```

#### Test 3.4: Super Admin Audit Logs
```
1. Login as super admin
2. Navigate to super-admin dashboard
3. Click "Audit Logs" section
4. ✓ Should see similar table as admin dashboard
5. ✓ Click "🔄 Refresh Logs"
6. ✓ Should show up to 500 logs (vs 200 for regular admin)
7. ✓ Should have additional filter buttons:
   - "Promotions" (PROMOTE/REVOKE actions)
   - "Password" (PASSWORD_RESET_* actions)
```

#### Test 3.5: Action Badges
```
Expected color-coded badges:
- 🔒 LOCK (red background)
- 🔓 UNLOCK (green background)
- ⚠️ WARNING (orange background)
- ✓ HC (green background)
- 📈 PROMOTE (orange background)
- ⚙️ FEATURE (purple background)
- 🔑 PASSWORD (blue background)

Verify each badge displays correctly in audit logs
```

#### Test 3.6: Login/Logout Logging
```
1. Go to login page
2. Login with any credentials
3. Go to admin dashboard
4. Click audit logs refresh
5. ✓ Most recent log should be "LOGIN" action
6. Click Logout
7. Check audit logs again
8. ✓ Should see "LOGOUT" action
```

---

## 🔍 Verification Commands

### Check Server Syntax
```bash
cd /workspaces/smart-chatbot-management-system-
node -c server.js
# Should output: ✓ Syntax check passed
```

### Check Database Collections
```bash
mongosh
> use chatbot
> db.auditlogs.find().limit(5)
# Should show recent audit records
```

### Check Token Storage
```javascript
// In browser console:
localStorage.getItem('accessToken')
localStorage.getItem('refreshToken')
// Both should return non-null values after login
```

---

## 📊 Expected Results Summary

### After Implementing All Features:

| Feature | Status | Evidence |
|---------|--------|----------|
| Token Rotation | ✅ | Auto-refresh on 401 responses |
| Password Reset | ✅ | OTP displayed in-app, new password works |
| Audit Logs | ✅ | All admin actions logged and visible |
| Refresh Link | ✅ | "Forgot Password?" appears on login |
| Badges | ✅ | Color-coded action types in audit table |
| Filters | ✅ | Filter buttons narrow audit log results |

---

## 🐛 Troubleshooting

### Problem: Password reset page not loading
**Solution:**
```bash
# Check if password-reset.html exists
ls -la password-reset.html
# Should exist and contain 200+ lines
```

### Problem: OTP not showing
**Solution:**
```bash
# Check browser console for errors
# Verify /api/auth/password-reset/request returns OTP
curl -X POST http://localhost:3000/api/auth/password-reset/request \
  -H "Content-Type: application/json" \
  -d '{"roll":"001"}'
```

### Problem: Audit logs empty
**Solution:**
```bash
# Check MongoDB AuditLog collection exists
mongosh
> use chatbot
> db.auditlogs.countDocuments()
# Should return > 0
```

### Problem: Token refresh not working
**Solution:**
```javascript
// In browser console after login:
console.log(localStorage.getItem('refreshToken'))
// Should return valid JWT
```

---

## 📱 Browser DevTools Checks

### Network Tab
```
✓ See 401 responses followed by /api/auth/refresh
✓ See request retry after token refresh
✓ No failed 401 errors in final state
```

### Application Tab (Storage)
```
✓ localStorage has accessToken
✓ localStorage has refreshToken
✓ Both tokens are valid JWTs (can decode)
✓ Tokens change after refresh
```

### Console Tab
```
✓ No CORS errors
✓ No "token expired" errors
✓ No 404 errors for password-reset.html
✓ Audit log functions callable (e.g., loadAuditLogs())
```

---

## ✨ Success Criteria

All tests pass when:
- ✅ User can login and tokens are stored
- ✅ User can click "Forgot Password?" link
- ✅ Password reset wizard completes successfully
- ✅ New password works for login
- ✅ Admin can view audit logs in dashboard
- ✅ Audit logs show recent admin actions
- ✅ Filter buttons work correctly
- ✅ Action badges display with correct colors
- ✅ Token automatically refreshes on expiry
- ✅ Logout revokes refresh token

---

## 📞 Support

For issues:
1. Check browser console for errors
2. Check server logs for API errors
3. Verify MongoDB connection
4. Verify environment variables are set
5. Check RECENT_UPDATES_v1.1.0.md for detailed info

---

**Version:** 1.1.0
**Status:** Ready for Testing
**Last Updated:** 2024
