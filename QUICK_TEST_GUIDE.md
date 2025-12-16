# 🚀 QUICK START & TESTING GUIDE

## ⚡ Immediate Testing Steps

### 1. Start the Server
```bash
cd /workspaces/smart-chatbot-management-system-
npm start
# OR if already running:
# Server should be at: https://smart-chatbot-backend-w5tq.onrender.com
```

### 2. Test Admin Panel Features

#### A. Login as Admin
1. Open `admin.html`
2. Login with admin credentials
3. You should see dashboard with stats

#### B. Test Dark Mode (NEW FIX)
1. Click "🌙 Dark Mode" in sidebar
2. Page should darken
3. Refresh page - dark mode should persist

#### C. Test Lock/Unlock (FIXED)
1. Click "🔒 Lock/Unlock" in sidebar
2. Enter a student roll number (e.g., "2023CS001")
3. Set lock duration: 86400 (1 day)
4. Click "🔒 Lock Student"
5. Should see "✅ Student locked successfully"
6. Go to User Management - status should show "🔒 Locked"
7. Click "🔓 Unlock Student" to unlock

#### D. Test Warnings (FIXED)
1. Click "⚠️ Warnings" in sidebar
2. Enter student roll number
3. Select warning level (Low/Medium/High)
4. Enter reason: "Test warning"
5. Click "⚠️ Issue Warning"
6. Should see "✅ Warning issued"

#### E. Test Messages (FIXED)
1. Click "💬 Messages" in sidebar
2. Enter message title: "Test Message"
3. Enter content: "This is a test"
4. Select type: Info
5. Enter recipient roll: "2023CS001"
6. Click "📨 Send Message"
7. Should see "✅ Message sent successfully"

#### F. Test Rewards (NEW FEATURE)
1. Click "🎁 Rewards" in sidebar
2. Enter student roll
3. Title: "Excellent Work"
4. Content: "Keep up the great performance!"
5. Points: 100
6. Click "🏆 Send Reward"
7. Should see "✅ Reward sent successfully"

#### G. Test QR Code (FIXED)
1. Go to "👥 User Management"
2. Find any student in table
3. Click "🔲 QR" button
4. QR code modal should appear with student info
5. Click "✖️ Close"

#### H. Test Student Detail Viewer (FIXED)
1. In User Management table
2. Click "👁️ View" button for any student
3. Modal should show:
   - Student info (roll, name, dept, etc.)
   - Chat history (last 50 messages)
   - Warnings
4. Click "✖️ Close"

### 3. Test Student Features

#### A. Test Chatbot (FIXED)
1. Login as a student
2. Open chatbot page
3. Type: "What course plans are available?"
4. Should get response mentioning uploaded PDFs
5. Should NOT see "Message failed try again later"

#### B. Test Lock Status Display (ALREADY WORKING)
1. Login as student
2. Open student.html (dashboard)
3. Look for "Account / Chat Lock Status" section
4. Should show either:
   - "✅ Unlocked" in green
   - "🔒 Locked" in red (if locked by admin)

#### C. Test Mailbox for Rewards
1. In student dashboard
2. Look at "Mailbox" section
3. If admin sent rewards, should see messages with 🎁 icon
4. Click to expand and read

#### D. Test Settings (ALREADY WORKING)
1. Open settings.html
2. Change theme to "Dark"
3. Change font size to "Large"
4. Click "Save Settings"
5. Should see "✔ Settings saved!"

---

## 🐛 Troubleshooting

### If admin features still don't work:

1. **Clear browser cache:**
   - Press Ctrl+Shift+Delete
   - Clear cached files
   - Refresh page

2. **Check browser console:**
   - Press F12
   - Go to Console tab
   - Look for errors
   - Should see "✅ CSRF Token loaded: Yes"

3. **Verify server is running:**
   ```bash
   # Check if server is responding
   curl https://smart-chatbot-backend-w5tq.onrender.com/api/csrf-token
   ```

### If chatbot says "Message failed":

1. **Check CSRF token:**
   - Open browser console in chatbot page
   - Should see "✅ CSRF Token loaded: Yes"
   - If not, refresh page

2. **Check login token:**
   - Open DevTools → Application → Local Storage
   - Verify "token" exists
   - If not, login again

---

## ✅ Confirmation Checklist

Before marking as complete, verify:

- [ ] Admin can login
- [ ] Dark mode works
- [ ] Can lock/unlock students
- [ ] Can issue warnings
- [ ] Can send messages
- [ ] Can send rewards
- [ ] QR codes generate
- [ ] Student details load
- [ ] Chatbot responds without errors
- [ ] Lock status shows in student page
- [ ] Settings page works
- [ ] No console errors

---

**If all checkboxes are ✅, system is 100% working!** 🎉
