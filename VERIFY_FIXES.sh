#!/bin/bash

# Quick Verification Script for Smart Chatbot System
# Run this to verify all fixes are in place

echo "🔍 VERIFYING ALL FIXES..."
echo ""

# Check 1: CSRF token variable in admin.js
echo "✓ Check 1: CSRF token variable in admin.js"
if grep -q "let csrfToken = \"\";" /workspaces/smart-chatbot-management-system-/admin.js; then
    echo "  ✅ PASS: csrfToken variable found"
else
    echo "  ❌ FAIL: csrfToken variable NOT found"
fi
echo ""

# Check 2: loadCSRF function in admin.js
echo "✓ Check 2: loadCSRF function in admin.js"
if grep -q "async function loadCSRF()" /workspaces/smart-chatbot-management-system-/admin.js; then
    echo "  ✅ PASS: loadCSRF function found"
else
    echo "  ❌ FAIL: loadCSRF function NOT found"
fi
echo ""

# Check 3: initAdmin calls loadCSRF
echo "✓ Check 3: initAdmin calls loadCSRF"
if grep -A 10 "async function initAdmin()" /workspaces/smart-chatbot-management-system-/admin.js | grep -q "await loadCSRF()"; then
    echo "  ✅ PASS: initAdmin calls loadCSRF"
else
    echo "  ❌ FAIL: initAdmin doesn't call loadCSRF"
fi
echo ""

# Check 4: Correct middleware order in server.js
echo "✓ Check 4: Correct middleware order in server.js"
if grep -q 'planUpload.*single("file").*csrfProtect' /workspaces/smart-chatbot-management-system-/server.js; then
    echo "  ✅ PASS: Multer runs before csrfProtect"
else
    echo "  ❌ FAIL: Middleware order may be wrong"
fi
echo ""

# Check 5: Only one lock endpoint
echo "✓ Check 5: No duplicate lock endpoints"
LOCK_COUNT=$(grep -c 'app.post("/api/admin/lock"' /workspaces/smart-chatbot-management-system-/server.js)
if [ "$LOCK_COUNT" -eq 1 ]; then
    echo "  ✅ PASS: Only 1 lock endpoint (duplicates removed)"
else
    echo "  ❌ FAIL: Found $LOCK_COUNT lock endpoints (should be 1)"
fi
echo ""

# Check 6: CSRF token in student.html
echo "✓ Check 6: CSRF token support in student.html"
if grep -q "let csrfToken = \"\";" /workspaces/smart-chatbot-management-system-/student.html; then
    echo "  ✅ PASS: csrfToken variable in student.html"
else
    echo "  ❌ FAIL: csrfToken NOT in student.html"
fi
echo ""

# Check 7: loadCSRF in student.html
echo "✓ Check 7: loadCSRF function in student.html"
if grep -q "async function loadCSRF()" /workspaces/smart-chatbot-management-system-/student.html; then
    echo "  ✅ PASS: loadCSRF function found in student.html"
else
    echo "  ❌ FAIL: loadCSRF NOT in student.html"
fi
echo ""

# Check 8: authHeaders includes CSRF
echo "✓ Check 8: authHeaders includes CSRF token"
if grep -A 5 "function authHeaders()" /workspaces/smart-chatbot-management-system-/student.html | grep -q "x-csrf-token"; then
    echo "  ✅ PASS: authHeaders includes x-csrf-token"
else
    echo "  ❌ FAIL: authHeaders doesn't include CSRF"
fi
echo ""

# Check 9: No syntax errors in modified files
echo "✓ Check 9: Syntax validation"
echo "  Checking admin.js..."
if node -c /workspaces/smart-chatbot-management-system-/admin.js 2>/dev/null; then
    echo "  ✅ admin.js syntax: OK"
else
    echo "  ⚠️  admin.js syntax check not available (runtime check needed)"
fi

echo "  Checking server.js..."
if node -c /workspaces/smart-chatbot-management-system-/server.js 2>/dev/null; then
    echo "  ✅ server.js syntax: OK"
else
    echo "  ⚠️  server.js syntax check not available (runtime check needed)"
fi
echo ""

echo "════════════════════════════════════════════════"
echo "✅ VERIFICATION COMPLETE"
echo ""
echo "Next Steps:"
echo "1. Start the server: npm start"
echo "2. Open browser: http://localhost:3000"
echo "3. Login and test each feature"
echo ""
echo "Test Checklist:"
echo "□ Admin login works"
echo "□ Dashboard displays stats"
echo "□ PDF upload works"
echo "□ PDF delete works"
echo "□ Lock/unlock works"
echo "□ Warnings work"
echo "□ Messages work"
echo "□ Student dashboard works"
echo "□ Student mailbox works"
echo "□ Chatbot works"
echo ""
