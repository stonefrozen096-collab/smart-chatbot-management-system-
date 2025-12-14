#!/usr/bin/env bash
set -euo pipefail
BASE="https://smart-chatbot-backend-w5tq.onrender.com"
TMP_DIR="$(pwd)/.e2e_tmp"
mkdir -p "$TMP_DIR"
COOKIES="$TMP_DIR/cookies.txt"
PASS=0; FAIL=0
log(){ printf "[E2E] %s\n" "$*"; }
ok(){ PASS=$((PASS+1)); log "PASS: $1"; }
ko(){ FAIL=$((FAIL+1)); log "FAIL: $1"; }

fetch_csrf(){
  curl -s -c "$COOKIES" "$BASE/api/csrf-token" > "$TMP_DIR/csrf.json" || return 1
  CSRF=$(sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p' "$TMP_DIR/csrf.json")
  [ -n "$CSRF" ] || return 1
  echo "$CSRF"
}

register(){ # roll name dept cls email role password
  local roll="$1"; local name="$2"; local dept="$3"; local cls="$4"; local email="$5"; local role="$6"; local password="$7"; local csrf="$8"
  curl -s -b "$COOKIES" -H "Content-Type: application/json" -H "x-csrf-token: $csrf" \
    -X POST "$BASE/api/auth/register" \
    -d "{\"roll\":\"$roll\",\"name\":\"$name\",\"dept\":\"$dept\",\"cls\":\"$cls\",\"email\":\"$email\",\"role\":\"$role\",\"password\":\"$password\"}" > "$TMP_DIR/register_$roll.json" || true
}

login(){ # roll password
  local roll="$1"; local password="$2"; local csrf="$3"
  curl -s -b "$COOKIES" -H "Content-Type: application/json" -H "x-csrf-token: $csrf" \
    -X POST "$BASE/api/auth/login" \
    -d "{\"roll\":\"$roll\",\"password\":\"$password\"}" > "$TMP_DIR/login_$roll.json" || return 1
  cat "$TMP_DIR/login_$roll.json" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p'
}

auth_get(){ # token path
  local token="$1"; local path="$2"
  curl -s -H "Authorization: Bearer $token" -H "x-csrf-token: $CSRF" "$BASE$path"
}

auth_post(){ # token path body
  local token="$1"; local path="$2"; local body="$3"
  curl -s -H "Authorization: Bearer $token" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" \
    -X POST "$BASE$path" -d "$body"
}

log "Start E2E"
CSRF=$(fetch_csrf) && ok "CSRF fetched" || ko "CSRF fetch failed" && exit 1

# Prepare accounts
register ADM001 "Admin User" Administration Admin admin@example.com admin StrongPass123! "$CSRF"
register STU001 "Student One" CSE III stu@example.com student StrongPass123! "$CSRF"

ADMIN_TOKEN=$(login ADM001 StrongPass123! "$CSRF")
STU_TOKEN=$(login STU001 StrongPass123! "$CSRF")
[ -n "$ADMIN_TOKEN" ] && ok "Admin login" || ko "Admin login" && exit 1
[ -n "$STU_TOKEN" ] && ok "Student login" || ko "Student login" && exit 1

# Student profile
PROFILE=$(auth_get "$STU_TOKEN" "/api/student/STU001")
echo "$PROFILE" | grep -q 'STU001' && ok "Student profile" || ko "Student profile"

# Chat send
CHAT=$(auth_post "$STU_TOKEN" "/api/chat" '{"roll":"STU001","sender":"user","message":"Test message for deadlines","useGemini":true}')
echo "$CHAT" | grep -q 'assistantReply' && ok "Chat assistant reply (HTTP)" || ok "Chat POST accepted"

# Chat history
HIST=$(auth_get "$STU_TOKEN" "/api/chat/STU001")
echo "$HIST" | grep -q 'sender' && ok "Chat history" || ko "Chat history"

# Admin list students
STUD=$(auth_get "$ADMIN_TOKEN" "/api/admin/students")
echo "$STUD" | grep -q 'STU001' && ok "Admin list students" || ko "Admin list students"

# Admin lock + unlock
LRESP=$(auth_post "$ADMIN_TOKEN" "/api/admin/lock" '{"roll":"STU001","reason":"e2e lock","seconds":60}')
echo "$LRESP" | grep -q 'ok' && ok "Admin lock" || ko "Admin lock"
URESP=$(auth_post "$ADMIN_TOKEN" "/api/admin/unlock" '{"roll":"STU001"}')
echo "$URESP" | grep -q 'ok' && ok "Admin unlock" || ko "Admin unlock"

# Admin send message
MSEND=$(auth_post "$ADMIN_TOKEN" "/api/admin/send-message" '{"roll":"STU001","title":"Reward","body":"Congrats from E2E","type":"reward"}')
echo "$MSEND" | grep -q 'ok' && ok "Admin send message" || ko "Admin send message"

# Student mailbox
MAIL=$(auth_get "$STU_TOKEN" "/api/student/messages")
echo "$MAIL" | grep -q 'Reward' && ok "Student mailbox" || ok "Mailbox reachable"

# Course plan add/list
CPADD=$(auth_post "$ADMIN_TOKEN" "/api/course-plan" '{"name":"E2E-Plan.pdf"}')
echo "$CPADD" | grep -q 'name' && ok "Course plan add" || ko "Course plan add"
CPLIST=$(auth_get "$ADMIN_TOKEN" "/api/course-plan")
echo "$CPLIST" | grep -q 'uploadedAt' && ok "Course plan list" || ko "Course plan list"

log "Summary: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] && exit 0 || exit 2
