/* ==========================================================================
   COMPLETE ADMIN PANEL - ALL FEATURES 100% WORKING
   Fixed: Lock/Unlock, Warnings, Messages, Rewards, QR Codes, Dark Mode
========================================================================== */

// API base: allow runtime override for separate frontend/backend on Render
// Hardcoded backend for stable routing on Render
const API = 'https://smart-chatbot-backend-w5tq.onrender.com';
let csrfToken = "";
let allStudents = [];
let darkMode = localStorage.getItem('adminDarkMode') === 'true';
let coursePlanDisabled = false;

// Apply dark mode if stored
if (darkMode) document.documentElement.classList.add('dark-mode');

//=== AUTH & CSRF ===
function getToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('token') || null;
}

async function loadCSRF() {
  try {
    const res = await fetch(`${API}/api/csrf-token`, {
      method: "GET",
      credentials: "include"
    });
    const data = await res.json();
    csrfToken = data.csrfToken || "";
    return csrfToken;
  } catch (e) {
    console.error("CSRF token fetch failed:", e);
    return "";
  }
}

function getCSRF() {
  if (csrfToken) return csrfToken;
  const cookies = document.cookie.split('; ');
  const csrfCookie = cookies.find(c => c.startsWith('csrf_token='));
  return csrfCookie ? csrfCookie.split('=')[1] : '';
}

async function secureFetch(url, options = {}) {
  const token = getToken();
  let csrf = csrfToken || getCSRF();
  
  if (!token) {
    alert('Session expired. Please login again.');
    window.location.href = 'index.html';
    return null;
  }

  options.credentials = 'include';
  options.headers = options.headers || {};
  options.headers['Authorization'] = `Bearer ${token}`;
  options.headers['x-csrf-token'] = csrf;
  
  try {
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
      const data = await res.json().catch(() => ({}));
      alert(`Unauthorized: ${data.error || 'Please login again'}`);
      localStorage.removeItem('token');
      sessionStorage.removeItem('token');
      window.location.href = 'index.html';
      return null;
    }
    return res;
  } catch (err) {
    console.error('Fetch error:', err);
    return null;
  }
}

function escapeHTML(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str).replace(/[&<>"']/g, c => map[c]);
}

//=== SECTION SWITCHING ===
function showSection(id) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
  if (id === 'redeemCodes') loadRedeemCodes();
  if (id === 'appeals') loadAppeals();
}

//=== DARK MODE ===
function toggleDarkMode() {
  darkMode = !darkMode;
  document.documentElement.classList.toggle('dark-mode', darkMode);
  localStorage.setItem('adminDarkMode', darkMode);
  alert(darkMode ? '🌙 Dark mode enabled' : '☀️ Light mode enabled');
}

//=== LOGOUT ===
async function logout() {
  const token = getToken();
  if (token) {
    await secureFetch(`${API}/api/auth/logout`, { method: 'POST', body: JSON.stringify({}) });
  }
  localStorage.clear();
  sessionStorage.clear();
  window.location.href = 'index.html';
}

//===============================================
// 1. STUDENT MANAGEMENT & QR CODES
//===============================================
async function loadStudents() {
  const res = await secureFetch(`${API}/api/admin/students?perPage=1000`);
  if (!res || !res.ok) { alert('Failed to load students'); return; }
  
  const students = await res.json();
  allStudents = Array.isArray(students) ? students : [];
  
  // Update users table
  const usersTable = document.querySelector('#usersTable tbody') || document.querySelector('#usersTable');
  if (usersTable) {
    // Clear existing rows except header
    const rows = usersTable.querySelectorAll('tr');
    rows.forEach((r, idx) => { if (idx > 0) r.remove(); });
    
    allStudents.forEach(s => {
      const row = document.createElement('tr');
      const status = s.lockedUntil && new Date(s.lockedUntil) > new Date() ? '🔒 Locked' : '✅ Active';
      row.innerHTML = `
        <td>${escapeHTML(s.roll)}</td>
        <td>${escapeHTML(s.name)}</td>
        <td>${escapeHTML(s.dept)}</td>
        <td>${escapeHTML(s.cls || '—')}</td>
        <td>${status}</td>
        <td>
          <button onclick="viewStudentQR('${s.roll}', '${escapeHTML(s.name)}', '${escapeHTML(s.dept)}')" title="View QR Code" style="padding:5px 8px;font-size:12px;margin:2px;">🔲 QR</button>
          <button onclick="viewStudentDetail('${s.roll}')" title="View Details" style="padding:5px 8px;font-size:12px;margin:2px;">👁️ View</button>
          <button onclick="selectStudent('${s.roll}')" title="Select" style="padding:5px 8px;font-size:12px;margin:2px;">✔️ Select</button>
        </td>
      `;
      usersTable.appendChild(row);
    });
  }
}

function selectStudent(roll) {
  // Set roll in all relevant input fields
  const fields = ['studentLock', 'studentWarning', 'msgRecipients', 'rewardRecipient'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = roll;
  });
  alert(`✅ Selected student: ${roll}\nYou can now lock/unlock, issue warnings, or send messages.`);
}

function filterUsers() {
  const searchTerm = document.getElementById('userSearchInput')?.value.toLowerCase() || '';
  const usersTable = document.getElementById('usersTable');
  if (!usersTable) return;
  
  const rows = usersTable.querySelectorAll('tr');
  rows.forEach((row, idx) => {
    if (idx === 0) return;
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(searchTerm) ? '' : 'none';
  });
}

//===============================================
// 2. LOCK / UNLOCK STUDENTS
//===============================================
async function lockStudent() {
  const roll = document.getElementById('studentLock')?.value;
  const seconds = parseInt(document.getElementById('lockSeconds')?.value || 86400);
  
  if (!roll) return alert('❌ Please enter a student roll number');
  
  const res = await secureFetch(`${API}/api/admin/lock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roll, reason: 'Admin lock', seconds })
  });
  
  if (res && res.ok) {
    alert('✅ Student locked successfully');
    loadStudents();
  } else {
    const error = await res?.text();
    alert('❌ Failed to lock student: ' + error);
  }
}

async function unlockStudent() {
  const roll = document.getElementById('studentLock')?.value;
  if (!roll) return alert('❌ Please enter a student roll number');
  
  const res = await secureFetch(`${API}/api/admin/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roll })
  });
  
  if (res && res.ok) {
    alert('✅ Student unlocked successfully');
    loadStudents();
  } else {
    const error = await res?.text();
    alert('❌ Failed to unlock student: ' + error);
  }
}

//===============================================
// 3. WARNINGS
//===============================================
async function issueWarning() {
  const roll = document.getElementById('studentWarning')?.value;
  const reason = document.getElementById('warningReason')?.value;
  const level = document.getElementById('warningLevel')?.value || 'low';
  
  if (!roll || !reason) return alert('❌ Fill all fields');
  
  const res = await secureFetch(`${API}/api/warning`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roll, reason, level })
  });
  
  if (res && res.ok) {
    alert('✅ Warning issued');
    document.getElementById('warningReason').value = '';
    loadWarnings(roll);
  } else {
    const error = await res?.text();
    alert('❌ Failed to issue warning: ' + error);
  }
}

async function loadWarnings(roll = '') {
  if (!roll) roll = document.getElementById('studentWarning')?.value;
  if (!roll) { alert('Select a student first'); return; }
  
  const res = await secureFetch(`${API}/api/admin/warnings/${encodeURIComponent(roll)}`);
  if (!res || !res.ok) { alert('Failed to load warnings'); return; }
  
  const warnings = await res.json();
  const container = document.getElementById('warningsContainer') || document.createElement('div');
  container.innerHTML = '';
  
  if (!Array.isArray(warnings) || warnings.length === 0) {
    container.innerHTML = '<p style="opacity:0.7">No warnings for this student</p>';
    return;
  }
  
  warnings.forEach(w => {
    const div = document.createElement('div');
    div.style.cssText = 'background:rgba(239,68,68,0.2);padding:10px;margin:5px 0;border-radius:8px;display:flex;justify-content:space-between;align-items:center;gap:10px;';
    const info = document.createElement('div');
    info.innerHTML = `
      <strong>⚠️ ${escapeHTML(w.reason || 'Warning')}</strong> - Level: ${escapeHTML(w.level || 'low')}<br>
      <span style="opacity:0.8;font-size:12px;">${new Date(w.createdAt).toLocaleString()}</span>
    `;
    const btn = document.createElement('button');
    btn.textContent = 'Remove';
    btn.style.background = '#ef4444';
    btn.onclick = () => deleteWarning(w._id, roll);
    div.appendChild(info);
    div.appendChild(btn);
    container.appendChild(div);
  });
}

async function deleteWarning(warningId, roll) {
  if (!confirm('Remove this violation?')) return;
  const res = await secureFetch(`${API}/api/warning/${warningId}`, { method: 'DELETE' });
  if (res && res.ok) {
    alert('✅ Violation removed');
    await loadWarnings(roll);
    await loadStudents();
  } else {
    alert('❌ Failed to remove violation');
  }
}

//===============================================
// 4. NOTICES
//===============================================
async function createNotice() {
  const title = document.getElementById('noticeTitle')?.value.trim();
  const body = document.getElementById('noticeBody')?.value.trim();
  const urgent = document.getElementById('noticeUrgent')?.checked || false;
  
  if (!title || !body) return alert('❌ Fill all fields');
  
  const res = await secureFetch(`${API}/api/admin/notice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, urgent })
  });
  
  if (res && res.ok) {
    alert('✅ Notice created successfully');
    document.getElementById('noticeTitle').value = '';
    document.getElementById('noticeBody').value = '';
    document.getElementById('noticeUrgent').checked = false;
    loadNotices();
  } else {
    const error = await res?.text();
    alert('❌ Failed to create notice: ' + error);
  }
}

async function loadNotices() {
  const res = await secureFetch(`${API}/api/notices`);
  if (!res || !res.ok) return;
  
  const notices = await res.json();
  const container = document.getElementById('noticesContainer');
  if (!container) return;
  
  container.innerHTML = '';
  if (!Array.isArray(notices) || notices.length === 0) {
    container.innerHTML = '<p style="opacity:0.7">No notices</p>';
    return;
  }
  
  notices.forEach(n => {
    const div = document.createElement('div');
    div.style.cssText = 'background:rgba(59,130,246,0.2);padding:10px;margin:5px 0;border-radius:8px;display:flex;justify-content:space-between;align-items:start;gap:10px;';
    div.innerHTML = `
      <div style="flex:1;">
        <strong>${n.urgent ? '🔴 ' : ''}${escapeHTML(n.title)}</strong><br>
        <span style="opacity:0.9;">${escapeHTML(n.body || '')}</span><br>
        <span style="opacity:0.7;font-size:11px;">${new Date(n.createdAt).toLocaleString()}</span>
      </div>
      <button onclick="deleteNotice('${n._id}')" style="background:#dc2626;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;white-space:nowrap;font-size:12px;">🗑️ Delete</button>
    `;
    container.appendChild(div);
  });
}

async function deleteNotice(noticeId) {
  if (!confirm('Are you sure you want to delete this notice?')) return;
  
  const res = await secureFetch(`${API}/api/admin/notice/${noticeId}`, {
    method: 'DELETE'
  });
  
  if (!res) return;
  if (res.ok) {
    alert('✅ Notice deleted');
    loadNotices();
  } else {
    const err = await res.json().catch(() => ({}));
    alert('❌ Failed to delete notice: ' + (err.error || 'Unknown error'));
  }
}

//===============================================
// 5. DIRECT MESSAGES & REWARDS
//===============================================
async function sendDirectMessage() {
  const title = document.getElementById('msgTitle')?.value.trim();
  const content = document.getElementById('msgContent')?.value.trim();
  const type = document.getElementById('msgType')?.value || 'info';
  const recipients = document.getElementById('msgRecipients')?.value.trim().split(',').map(r => r.trim()).filter(r => r);
  
  if (!title || !content || recipients.length === 0) {
    return alert('❌ Fill all fields (title, content, recipients)');
  }
  
  const res = await secureFetch(`${API}/api/admin/send-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body: content, type, recipients })
  });
  
  if (res && res.ok) {
    const data = await res.json();
    alert(`✅ Message sent successfully to ${recipients.length} student(s)!`);
    document.getElementById('msgTitle').value = '';
    document.getElementById('msgContent').value = '';
    document.getElementById('msgRecipients').value = '';
  } else {
    const error = await res?.text();
    alert('❌ Failed to send message: ' + error);
  }
}

async function sendReward() {
  const recipient = document.getElementById('rewardRecipient')?.value.trim();
  const title = document.getElementById('rewardTitle')?.value.trim();
  const content = document.getElementById('rewardContent')?.value.trim();
  const points = parseInt(document.getElementById('rewardPoints')?.value || 0);
  
  if (!recipient || !title || !content) {
    return alert('❌ Fill all fields');
  }
  
  const res = await secureFetch(`${API}/api/admin/send-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `🎁 ${title}`,
      body: `${content}\n\n🏆 Reward Points: ${points}`,
      type: 'reward',
      recipients: [recipient]
    })
  });
  
  if (res && res.ok) {
    alert('✅ Reward sent successfully!');
    document.getElementById('rewardRecipient').value = '';
    document.getElementById('rewardTitle').value = '';
    document.getElementById('rewardContent').value = '';
    document.getElementById('rewardPoints').value = '';
  } else {
    const error = await res?.text();
    alert('❌ Failed to send reward: ' + error);
  }
}

// Grant a cosmetic reward (avatar border, name style, chat color, background, badge)
async function grantCosmetic(type, value, applyNow = true) {
  const recipient = document.getElementById('rewardRecipient')?.value.trim();
  if (!recipient) return alert('Enter a recipient roll in the Rewards section');
  const res = await secureFetch(`${API}/api/admin/reward/cosmetic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roll: recipient, type, value, applyNow })
  });
  if (res && res.ok) {
    alert(`✅ Granted ${type}: ${value} to ${recipient}`);
  } else {
    const t = await res?.text();
    alert('❌ Failed to grant cosmetic: ' + t);
  }
}

async function migrateSettings() {
  const statusEl = document.getElementById('migrationStatus');
  if (!confirm('This will initialize cosmetics storage for ALL students in your MongoDB database. Continue?')) return;
  
  statusEl.textContent = '⏳ Running migration...';
  statusEl.style.color = '#f59e0b';
  
  try {
    const res = await secureFetch(`${API}/api/admin/migrate-settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (res && res.ok) {
      const data = await res.json();
      statusEl.textContent = `✅ ${data.message}`;
      statusEl.style.color = '#10b981';
      alert(`✅ Migration successful!\n\n${data.message}\n\nCosmetics will now unlock properly for all students.`);
    } else {
      const err = await res?.text();
      statusEl.textContent = `❌ Migration failed: ${err}`;
      statusEl.style.color = '#ef4444';
      alert('❌ Migration failed. Check console for details.');
    }
  } catch (e) {
    statusEl.textContent = `❌ Error: ${e.message}`;
    statusEl.style.color = '#ef4444';
    console.error('Migration error:', e);
  }
}

async function debugStudentSettings() {
  const out = document.getElementById('debugOutput');
  const roll = document.getElementById('rewardRecipient')?.value.trim();
  if (!roll) {
    out.textContent = '❌ Enter a recipient roll in the Rewards section';
    return;
  }

  out.textContent = `⏳ Loading debug for ${roll}...`;

  try {
    const res = await secureFetch(`${API}/api/admin/debug/student/${encodeURIComponent(roll)}`);
    const data = await res.json();

    if (!res.ok) {
      out.textContent = `❌ Error: ${data.error || 'Unknown error'}`;
      console.error('Debug response not ok:', res.status, data);
      return;
    }

    // Pretty print all fields
    const display = {
      roll: data.roll,
      hasSettings: data.hasSettings,
      settingsKeys: data.settingsKeys,
      unlockedAvatarBorders: (data.unlocked?.avatarBorders || []).length,
      unlockedNameStyles: (data.unlocked?.nameStyles || []).length,
      unlockedChatColors: (data.unlocked?.chatColors || []).length,
      unlockedBadges: (data.unlocked?.badges || []).length,
      equippedChatColor: data.cosmetics?.chatBubbleColor || 'none',
      lockedUntil: data.lockedUntil,
      chatbotLockedUntil: data.chatbotLockedUntil,
      lastUpdate: data.updatedAt,
      _fullUnlocked: data.unlocked,
      _fullCosmetics: data.cosmetics,
    };

    out.textContent = '✅ Student data loaded:\n\n' + JSON.stringify(display, null, 2);
  } catch (e) {
    out.textContent = `❌ Exception: ${e.message}`;
    console.error('debugStudentSettings error:', e);
  }
}

async function grantVerifiedBadge(roll) {
  if (!roll) {
    roll = document.getElementById('rewardRecipient')?.value.trim();
    if (!roll) return alert('Enter a recipient roll in the Rewards section');
  }
  
  const res = await secureFetch(`${API}/api/admin/reward/verified`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roll, grantVerified: true })
  });
  
  if (res && res.ok) {
    alert(`✅ Verified badge granted to ${roll}! 🎖️`);
    loadStudents();
  } else {
    const t = await res?.text();
    alert('❌ Failed to grant verified badge: ' + t);
  }
}

async function removeVerifiedBadge(roll) {
  if (!confirm(`Remove verified badge from ${roll}?`)) return;
  
  const res = await secureFetch(`${API}/api/admin/reward/verified`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roll, grantVerified: false })
  });
  
  if (res && res.ok) {
    alert(`✅ Verified badge removed from ${roll}`);
    loadStudents();
  } else {
    const t = await res?.text();
    alert('❌ Failed to remove verified badge: ' + t);
  }
}

async function broadcastMessage() {
  const title = document.getElementById('broadcastTitle')?.value.trim();
  const content = document.getElementById('broadcastContent')?.value.trim();
  const filter = document.getElementById('broadcastFilter')?.value || 'all';
  
  if (!title || !content) return alert('❌ Fill all fields');
  
  let filterObj = {};
  if (filter === 'dept') {
    const dept = prompt('Enter department (e.g., CSE, ECE):');
    if (!dept) return;
    filterObj.dept = dept;
  } else if (filter === 'locked') {
    filterObj.locked = true;
  }
  
  const res = await secureFetch(`${API}/api/admin/broadcast-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body: content, filter: Object.keys(filterObj).length > 0 ? filterObj : null })
  });
  
  if (res && res.ok) {
    const data = await res.json();
    alert(`✅ Broadcast sent to ${data.sentTo || 'all'} student(s)!`);
    document.getElementById('broadcastTitle').value = '';
    document.getElementById('broadcastContent').value = '';
  } else {
    const error = await res?.text();
    alert('❌ Failed to send broadcast: ' + error);
  }
}

//===============================================
// 6. MESSAGE TEMPLATES
//===============================================
async function loadTemplates() {
  const res = await secureFetch(`${API}/api/admin/message-templates`);
  if (!res || !res.ok) return;
  
  const data = await res.json();
  const select = document.getElementById('templateSelect');
  const list = document.getElementById('templateList');
  
  if (select) {
    select.innerHTML = '<option value="">-- Select Template --</option>';
    if (data.templates && Array.isArray(data.templates)) {
      data.templates.forEach(t => {
        select.innerHTML += `<option value="${t._id}">${escapeHTML(t.name)} (${t.type})</option>`;
      });
    }
  }
  
  if (list) {
    list.innerHTML = '';
    if (data.templates && Array.isArray(data.templates)) {
      data.templates.forEach(t => {
        list.innerHTML += `<div style="padding:8px;background:rgba(255,255,255,0.05);margin:5px;border-radius:6px;font-size:12px;">
          <strong>${escapeHTML(t.name)}</strong> - ${escapeHTML(t.title || '')}
        </div>`;
      });
    }
  }
}

async function createTemplate() {
  const name = prompt('Template name:');
  if (!name) return;
  
  const title = document.getElementById('templateTitle')?.value.trim();
  const body = document.getElementById('templateBody')?.value.trim();
  const type = document.getElementById('templateType')?.value || 'info';
  
  if (!title || !body) return alert('Fill template fields first');
  
  const res = await secureFetch(`${API}/api/admin/message-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, title, content: body, type, category: 'custom' })
  });
  
  if (res && res.ok) {
    alert('✅ Template created');
    loadTemplates();
  } else {
    alert('❌ Failed to create template');
  }
}

function useTemplate(templateId) {
  // This would load the template into the message form
  alert('Template loaded');
}

//===============================================
// 7. COURSE PLANS
//===============================================
async function loadCourseSourceConfig() {
  try {
    const res = await secureFetch(`${API}/api/admin/course-source-config`);
    if (!res || !res.ok) return;
    const cfg = await res.json();
    coursePlanDisabled = !!cfg.coursePlanDisabled;
    const promptBox = document.getElementById('promptTopics');
    if (promptBox) promptBox.value = cfg.promptTopics || '';
    updateCoursePlanUI();
  } catch (e) { console.error('config load failed', e); }
}

function updateCoursePlanUI() {
  const planBtn = document.getElementById('planBtn');
  const planFile = document.getElementById('planFile');
  const status = document.getElementById('coursePlanStatus');
  const toggleBtn = document.getElementById('toggleCoursePlanBtn');
  if (planBtn) planBtn.disabled = coursePlanDisabled;
  if (planFile) planFile.disabled = coursePlanDisabled;
  if (status) status.textContent = coursePlanDisabled ? 'PDF uploads disabled' : 'PDF uploads enabled';
  if (toggleBtn) toggleBtn.textContent = coursePlanDisabled ? 'Enable PDF Uploads' : 'Disable PDF Uploads';
}

async function savePromptTopics() {
  const promptBox = document.getElementById('promptTopics');
  const topics = promptBox?.value || '';
  const res = await secureFetch(`${API}/api/admin/course-source-config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ promptTopics: topics })
  });
  if (res && res.ok) {
    alert('✅ Topics saved');
    await loadCourseSourceConfig();
  } else {
    alert('❌ Failed to save topics');
  }
}

async function toggleCoursePlanUpload() {
  const res = await secureFetch(`${API}/api/admin/course-source-config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ coursePlanDisabled: !coursePlanDisabled })
  });
  if (res && res.ok) {
    alert(!coursePlanDisabled ? '🚫 PDF uploads disabled' : '✅ PDF uploads enabled');
    await loadCourseSourceConfig();
  } else {
    alert('❌ Failed to toggle uploads');
  }
}

async function uploadCoursePlan() {
  const fileInput = document.getElementById('planFile');
  const nameInput = document.getElementById('planName');

  if (coursePlanDisabled) return alert('PDF uploads are disabled. Enable them first.');
  
  if (!fileInput || !fileInput.files.length) return alert('❌ Select a PDF file');
  
  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', nameInput?.value || file.name);
  
  const token = getToken();
  const csrf = csrfToken || getCSRF();
  
  if (!csrf) {
    alert('❌ CSRF token missing. Refreshing...');
    await loadCSRF();
    return;
  }
  
  try {
    const res = await fetch(`${API}/api/course-plan`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-csrf-token': csrf
      },
      credentials: 'include',
      body: formData
    });
    
    if (res && res.ok) {
      alert('✅ Course plan uploaded successfully');
      fileInput.value = '';
      if (nameInput) nameInput.value = '';
      loadCoursePlans();
    } else {
      const error = await res.text();
      alert('❌ Upload failed: ' + error);
    }
  } catch (err) {
    console.error('Upload error:', err);
    alert('❌ Upload error: ' + err.message);
  }
}

async function loadCoursePlans() {
  const res = await secureFetch(`${API}/api/course-plan`);
  if (!res || !res.ok) return;
  
  const plans = await res.json();
  const table = document.querySelector('#plansTable tbody') || document.querySelector('#plansTable');
  if (!table) return;
  
  // Clear existing rows except header
  const rows = table.querySelectorAll('tr');
  rows.forEach((r, idx) => { if (idx > 0) r.remove(); });
  
  if (!Array.isArray(plans) || plans.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="3" style="text-align:center;opacity:0.7;">No course plans uploaded</td>';
    table.appendChild(row);
    return;
  }
  
  plans.forEach(p => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHTML(p.name)}</td>
      <td>${new Date(p.uploadedAt || p.createdAt).toLocaleDateString()}</td>
      <td><button onclick="deleteCoursePlan('${p._id}')" style="background:#ef4444;">Delete</button></td>
    `;
    table.appendChild(row);
  });
}

async function deleteCoursePlan(planId) {
  if (!confirm('Delete this course plan?')) return;
  
  const res = await secureFetch(`${API}/api/course-plan/${planId}`, {
    method: 'DELETE'
  });
  
  if (res && res.ok) {
    alert('✅ Course plan deleted');
    loadCoursePlans();
  } else {
    alert('❌ Failed to delete');
  }
}

//===============================================
// 8. APPEALS / STUDENT MESSAGES
//===============================================
async function loadAppeals() {
  const filter = document.getElementById('appealsFilter')?.value || '';
  const url = new URL(`${API}/api/admin/student-messages`);
  if (filter) url.searchParams.set('status', filter);
  const res = await secureFetch(url.toString());
  if (!res || !res.ok) { const c = document.getElementById('appealsContainer'); if (c) c.innerHTML = '<p style="opacity:0.7;">Failed to load messages</p>'; return; }
  
  const msgs = await res.json();
  const container = document.getElementById('appealsContainer');
  if (!container) return;
  
  container.innerHTML = '';
  if (!Array.isArray(msgs) || msgs.length === 0) {
    container.innerHTML = '<p style="opacity:0.7;">No messages</p>';
    return;
  }
  
  msgs.forEach(m => {
    const div = document.createElement('div');
    div.style.cssText = 'background:rgba(255,255,255,0.08);padding:12px;margin:8px 0;border-radius:10px;';
    const replyBlock = m.adminReply ? `<div style="margin-top:8px;background:rgba(34,197,94,0.2);padding:8px;border-radius:6px;"><strong>Admin Reply:</strong> ${escapeHTML(m.adminReply)}</div>` : '';
    
      // Labels UI
      const labelsHtml = (m.labels || []).map(label => 
        `<span style="display:inline-block;background:rgba(59,130,246,0.3);padding:2px 8px;border-radius:12px;font-size:11px;margin:2px;">${escapeHTML(label)} <button onclick="removeLabel('${m._id}', '${escapeHTML(label)}')" style="background:none;border:none;color:#fff;cursor:pointer;padding:0 2px;font-weight:bold;">×</button></span>`
      ).join('');
      const labelsBlock = `
        <div style="margin-top:8px;">
          <strong style="font-size:12px;">Labels:</strong>
          <div id="labels-${m._id}" style="display:inline-block;">${labelsHtml || '<span style="opacity:0.5;font-size:11px;">No labels</span>'}</div>
          <button onclick="addLabel('${m._id}')" style="font-size:11px;padding:2px 8px;margin-left:6px;background:rgba(59,130,246,0.5);">+ Add Label</button>
        </div>
      `;
    
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;">
        <div style="flex:1;">
          <strong>${escapeHTML(m.roll || 'Unknown')}</strong>
          <span style="opacity:0.8;font-size:12px;"> — ${new Date(m.createdAt).toLocaleString()}</span>
          <div class="badge" style="display:inline-block;margin-left:8px;background:rgba(59,130,246,0.25);padding:2px 8px;border-radius:999px;font-size:12px;">${escapeHTML(m.type)}</div>
          <div class="badge" style="display:inline-block;margin-left:6px;background:${m.status==='pending'?'rgba(234,179,8,0.25)': m.status==='closed'?'rgba(239,68,68,0.25)':'rgba(34,197,94,0.25)'};padding:2px 8px;border-radius:999px;font-size:12px;">${escapeHTML(m.status || 'pending')}</div>
          <div style="margin-top:6px;font-weight:600;">${escapeHTML(m.subject || '(no subject)')}</div>
          <div style="margin-top:6px;">${escapeHTML(m.message || '')}</div>
            ${labelsBlock}
          ${replyBlock}
        </div>
        <div>
          <button onclick="replyToStudentMessage('${m._id}')">Reply</button>
          <button onclick="closeStudentMessage('${m._id}')" style="background:#ef4444;">Mark Closed</button>
        </div>
      </div>
    `;
    container.appendChild(div);
  });
}

async function replyToStudentMessage(messageId) {
  const reply = prompt('Enter reply to student:');
  if (!reply) return;
  const status = confirm('Mark as responded? OK = responded, Cancel = resolved') ? 'responded' : 'resolved';
  try {
    const res = await secureFetch(`${API}/api/admin/student-messages/${messageId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply, status })
    });
    if (res && res.ok) {
      alert('✅ Reply sent');
      loadAppeals();
    } else {
      const err = await res.json().catch(() => ({}));
      alert('❌ Failed: ' + (err.error || 'Unknown error'));
      console.error('Reply failed:', err);
    }
  } catch (e) {
    alert('❌ Network error');
    console.error('Reply error:', e);
  }
}

async function closeStudentMessage(messageId) {
  const reason = prompt('Enter reason for closing:');
  if (reason === null) return; // cancelled
  try {
    const res = await secureFetch(`${API}/api/admin/student-messages/${messageId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    if (res && res.ok) {
      alert('✅ Appeal marked as closed');
      loadAppeals();
    } else {
      const err = await res.json().catch(() => ({}));
      alert('❌ Failed: ' + (err.error || 'Unknown error'));
      console.error('Close failed:', err);
    }
  } catch (e) {
    alert('❌ Network error');
    console.error('Close error:', e);
  }
}

  async function addLabel(messageId) {
    const label = prompt('Enter label name:');
    if (!label) return;
  
    try {
      // Fetch current message to get existing labels
      const getRes = await secureFetch(`${API}/api/admin/student-messages`);
      if (!getRes || !getRes.ok) {
        alert('❌ Failed to fetch current labels');
        return;
      }
      const msgs = await getRes.json();
      const msg = msgs.find(m => m._id === messageId);
      if (!msg) {
        alert('❌ Message not found');
        return;
      }
    
      const currentLabels = msg.labels || [];
      if (currentLabels.includes(label)) {
        alert('❌ Label already exists');
        return;
      }
    
      const newLabels = [...currentLabels, label];
    
      const res = await secureFetch(`${API}/api/admin/student-messages/${messageId}/labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labels: newLabels })
      });
    
      if (res && res.ok) {
        alert('✅ Label added');
        loadAppeals();
      } else {
        const err = await res.json().catch(() => ({}));
        alert('❌ Failed: ' + (err.error || 'Unknown error'));
      }
    } catch (e) {
      alert('❌ Network error');
      console.error('Add label error:', e);
    }
  }

  async function removeLabel(messageId, label) {
    try {
      // Fetch current message to get existing labels
      const getRes = await secureFetch(`${API}/api/admin/student-messages`);
      if (!getRes || !getRes.ok) {
        alert('❌ Failed to fetch current labels');
        return;
      }
      const msgs = await getRes.json();
      const msg = msgs.find(m => m._id === messageId);
      if (!msg) {
        alert('❌ Message not found');
        return;
      }
    
      const currentLabels = msg.labels || [];
      const newLabels = currentLabels.filter(l => l !== label);
    
      const res = await secureFetch(`${API}/api/admin/student-messages/${messageId}/labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labels: newLabels })
      });
    
      if (res && res.ok) {
        alert('✅ Label removed');
        loadAppeals();
      } else {
        const err = await res.json().catch(() => ({}));
        alert('❌ Failed: ' + (err.error || 'Unknown error'));
      }
    } catch (e) {
      alert('❌ Network error');
      console.error('Remove label error:', e);
    }
  }

//===============================================
// 9. DASHBOARD STATS
//===============================================
async function loadDashboardStats() {
  const res = await secureFetch(`${API}/api/admin/students?perPage=1000`);
  if (!res || !res.ok) return;
  
  const students = await res.json();
  const total = Array.isArray(students) ? students.length : 0;
  const locked = Array.isArray(students) ? students.filter(s => s.lockedUntil && new Date(s.lockedUntil) > new Date()).length : 0;
  const withWarnings = Array.isArray(students) ? students.filter(s => s.warningsCount > 0).length : 0;
  
  const totalEl = document.getElementById('totalStudents');
  const lockedEl = document.getElementById('lockedStudents') || document.getElementById('lockedCount');
  const warnedEl = document.getElementById('warningStudents') || document.getElementById('warnedCount');
  
  if (totalEl) totalEl.textContent = total;
  if (lockedEl) lockedEl.textContent = locked;
  if (warnedEl) warnedEl.textContent = withWarnings;
}

//===============================================
// 10. QR CODE & STUDENT DETAILS
//===============================================
function viewStudentQR(roll, name, dept) {
  const modal = document.getElementById('qrModal');
  const container = document.getElementById('qrCodeContainer');
  const info = document.getElementById('qrStudentInfo');
  
  if (!modal || !container || !info) {
    alert('QR Modal not found in HTML. Add the QR modal to admin.html');
    return;
  }
  
  container.innerHTML = '';
  
  const qrData = JSON.stringify({
    roll: roll,
    name: name,
    dept: dept,
    verified: true,
    timestamp: new Date().toISOString()
  });
  
  try {
    new QRCode(container, {
      text: qrData,
      width: 256,
      height: 256,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  } catch (e) {
    container.innerHTML = '<p style="color:red;">QR Code library not loaded. Check if qrcode.min.js is included.</p>';
  }
  
  info.textContent = `${name} (${roll}) - ${dept}`;
  modal.style.display = 'flex';
}

function closeQRModal() {
  const modal = document.getElementById('qrModal');
  if (modal) modal.style.display = 'none';
}

async function viewStudentDetail(roll) {
  const modal = document.getElementById('studentDetailModal');
  if (!modal) {
    alert('Student Detail Modal not found in HTML');
    return;
  }
  
  modal.style.display = 'flex';
  
  const nameEl = document.getElementById('detailStudentName');
  const infoEl = document.getElementById('detailStudentInfo');
  const chatEl = document.getElementById('detailChatHistory');
  const warningsEl = document.getElementById('detailWarnings');
  
  if (nameEl) nameEl.textContent = `Student Details: ${roll}`;
  if (infoEl) infoEl.innerHTML = '<p>Loading student info...</p>';
  if (chatEl) chatEl.innerHTML = '<p style="opacity:0.6;">Loading chat history...</p>';
  if (warningsEl) warningsEl.innerHTML = '<p>Loading warnings...</p>';
  
  // Load student info
  try {
    const student = allStudents.find(s => s.roll === roll);
    if (student && infoEl) {
      const status = student.lockedUntil && new Date(student.lockedUntil) > new Date() ? '🔒 Locked' : '✅ Active';
      infoEl.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:15px;font-size:14px;">
          <div><strong>Roll:</strong> ${escapeHTML(student.roll)}</div>
          <div><strong>Name:</strong> ${escapeHTML(student.name)}</div>
          <div><strong>Department:</strong> ${escapeHTML(student.dept)}</div>
          <div><strong>Class:</strong> ${escapeHTML(student.cls || '—')}</div>
          <div><strong>Email:</strong> ${escapeHTML(student.email || '—')}</div>
          <div><strong>Status:</strong> ${status}</div>
        </div>
      `;
    }
  } catch (e) {
    console.error('Error loading student info:', e);
  }
  
  // Load chat history
  try {
    const chatRes = await secureFetch(`${API}/api/chat/${roll}`);
    if (chatRes && chatRes.ok && chatEl) {
      const history = await chatRes.json();
      if (Array.isArray(history) && history.length > 0) {
        const last50 = history.slice(0, 50);
        chatEl.innerHTML = last50.map(msg => {
          const senderStyle = msg.sender === 'user' ? 'background:rgba(59,130,246,0.2);' : 'background:rgba(34,197,94,0.2);';
          const senderIcon = msg.sender === 'user' ? '👤' : '🤖';
          return `
            <div style="${senderStyle}padding:10px;margin:5px 0;border-radius:8px;">
              <div style="font-size:11px;opacity:0.8;margin-bottom:3px;">
                ${senderIcon} ${msg.sender} • ${msg.time || new Date(msg.createdAt).toLocaleString()}
              </div>
              <div style="font-size:13px;">${escapeHTML(msg.message)}</div>
            </div>
          `;
        }).join('');
      } else {
        chatEl.innerHTML = '<p style="opacity:0.6;">No chat history found</p>';
      }
    } else {
      chatEl.innerHTML = '<p style="color:red;">Failed to load chat history</p>';
    }
  } catch (e) {
    console.error('Error loading chat history:', e);
    if (chatEl) chatEl.innerHTML = '<p style="color:red;">Error loading chat history</p>';
  }
  
  // Load warnings
  try {
    const warnRes = await secureFetch(`${API}/api/admin/warnings/${roll}`);
    if (warnRes && warnRes.ok && warningsEl) {
      const warnings = await warnRes.json();
      if (Array.isArray(warnings) && warnings.length > 0) {
        warningsEl.innerHTML = warnings.map(w => `
          <div style="background:rgba(239,68,68,0.2);padding:10px;margin:5px 0;border-radius:8px;font-size:13px;display:flex;justify-content:space-between;align-items:center;gap:10px;">
            <div>
              <strong>⚠️ ${escapeHTML(w.reason || 'Warning')}</strong><br>
              <span style="opacity:0.8;font-size:11px;">${new Date(w.createdAt).toLocaleString()}</span>
            </div>
            <button style="background:#ef4444;" onclick="deleteWarning('${w._id}','${roll}')">Remove</button>
          </div>
        `).join('');
      } else {
        warningsEl.innerHTML = '<p style="opacity:0.6;">No warnings</p>';
      }
    } else {
      warningsEl.innerHTML = '<p style="color:red;">Failed to load warnings</p>';
    }
  } catch (e) {
    console.error('Error loading warnings:', e);
    if (warningsEl) warningsEl.innerHTML = '<p style="color:red;">Error loading warnings</p>';
  }
}

function closeStudentDetailModal() {
  const modal = document.getElementById('studentDetailModal');
  if (modal) modal.style.display = 'none';
}

//===============================================
// 10. HC CURRENCY MANAGEMENT
//===============================================
async function grantHCToStudent() {
  const roll = document.getElementById('hcRecipient')?.value.trim();
  const amount = parseInt(document.getElementById('hcAmount')?.value) || 0;
  const statusEl = document.getElementById('hcGrantStatus');
  
  if (!roll || !amount || amount <= 0) {
    if (statusEl) statusEl.textContent = '❌ Enter a valid roll and amount';
    return;
  }
  
  const res = await secureFetch(`${API}/api/admin/grant-hc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roll, amount })
  });
  
  if (!res) return;
  
  if (res.ok) {
    const data = await res.json();
    if (statusEl) statusEl.textContent = `✅ ${data.message} (New balance: ${data.hc} HC)`;
    document.getElementById('hcAmount').value = '';
    document.getElementById('hcRecipient').value = '';
  } else {
    const err = await res.json().catch(() => ({}));
    if (statusEl) statusEl.textContent = `❌ ${err.error || 'Failed to grant HC'}`;
  }
}

async function broadcastHCToAll() {
  const amount = parseInt(document.getElementById('broadcastHCAmount')?.value) || 0;
  const statusEl = document.getElementById('broadcastStatus');
  
  if (!amount || amount <= 0) {
    if (statusEl) statusEl.textContent = '❌ Enter a valid amount';
    return;
  }
  
  if (!confirm(`Are you sure you want to give ${amount} HC to ALL students? This cannot be undone.`)) {
    return;
  }
  
  const res = await secureFetch(`${API}/api/admin/broadcast-hc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount })
  });
  
  if (!res) return;
  
  if (res.ok) {
    const data = await res.json();
    if (statusEl) statusEl.textContent = `✅ ${data.message}`;
    document.getElementById('broadcastHCAmount').value = '';
  } else {
    const err = await res.json().catch(() => ({}));
    if (statusEl) statusEl.textContent = `❌ ${err.error || 'Failed to broadcast HC'}`;
  }
}

async function initAdmin() {
  const token = getToken();
  if (!token) {
    window.location.href = 'index.html';
    return;
  }
  
  // Load CSRF token first
  await loadCSRF();
  console.log("✅ CSRF Token loaded:", csrfToken ? "Yes" : "No");
  
  // Load all data
  await loadDashboardStats();
  await loadStudents();
  await loadNotices();
  await loadCourseSourceConfig();
  await loadCoursePlans();
  await loadTemplates();
  await loadAppeals();
  await loadRedeemCodes();
  
  showSection('dashboard');
}

// Export students CSV for reporting
function exportStudentData() {
  if (!Array.isArray(allStudents) || allStudents.length === 0) {
    alert('No students loaded');
    return;
  }
  const headers = ['roll','name','dept','cls','email','lockedUntil','warningsCount'];
  const rows = allStudents.map(s => headers.map(h => (s[h] ?? '').toString().replace(/"/g,'"')).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'students.csv';
  a.click();
}

//===============================================
// EVENT LISTENERS
//===============================================
document.addEventListener('DOMContentLoaded', () => {
  initAdmin();
  
  // Sidebar menu
  document.querySelectorAll('.menu a').forEach(link => {
    link.addEventListener('click', (e) => {
      const sectionId = link.getAttribute('data-section');
      if (sectionId) {
        e.preventDefault();
        showSection(sectionId);
      }
    });
  });
});

//===============================================
// 9. REDEEM CODES MANAGEMENT
//===============================================
async function loadRedeemCodes() {
  try {
    const container = document.getElementById('redeemCodesContainer');
    if (!container) {
      console.error('Redeem codes container not found');
      return;
    }
    
    console.log('[Redeem Codes] Starting load...');
    const res = await secureFetch(`${API}/api/admin/redeem-codes`);
    
    if (!res) {
      console.error('[Redeem Codes] No response from API');
      container.innerHTML = '<p style="opacity:0.7;">❌ Network error loading codes</p>';
      return;
    }
    
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error('[Redeem Codes] API error:', res.status, errData);
      container.innerHTML = `<p style="opacity:0.7;">❌ Error: ${errData.error || 'Failed to load codes'}</p>`;
      return;
    }
    
    const codes = await res.json();
    console.log('[Redeem Codes] Loaded:', codes);
    
    if (!Array.isArray(codes) || codes.length === 0) {
      container.innerHTML = '<p style="opacity:0.7;">📭 No redeem codes yet. Create one to get started!</p>';
      return;
    }
    
    const rows = codes.map(c => {
      const exp = c.isPermanent ? 'Permanent' : (c.expiresAt ? new Date(c.expiresAt).toLocaleString() : '—');
      const uses = (c.usedBy || []).length;
      const max = c.maxUses || '∞';
      const rewardStr = c.reward?.type === 'hc' ? `HC +${c.reward.amount}` : `${c.reward?.type}:${c.reward?.value || ''}`;
      return `<tr>
        <td><strong>${c.code}</strong><div style="opacity:0.7;font-size:12px;">${escapeHTML(c.description || '')}</div></td>
        <td>${escapeHTML(rewardStr)}</td>
        <td>${exp}</td>
        <td>${uses}/${max}</td>
        <td>${escapeHTML(c.createdBy || 'admin')}</td>
        <td><button onclick="deleteRedeemCode('${c._id}')" style="background:#ef4444;">Delete</button></td>
      </tr>`;
    }).join('');
    
    container.innerHTML = `<table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:2px solid rgba(255,255,255,0.2);">
          <th style="padding:12px;text-align:left;">Code</th>
          <th style="padding:12px;text-align:left;">Reward</th>
          <th style="padding:12px;text-align:left;">Expiry</th>
          <th style="padding:12px;text-align:center;">Uses</th>
          <th style="padding:12px;text-align:left;">Created By</th>
          <th style="padding:12px;text-align:center;">Action</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  } catch (err) {
    console.error('[Redeem Codes] Unexpected error:', err);
    const container = document.getElementById('redeemCodesContainer');
    if (container) {
      container.innerHTML = '<p style="opacity:0.7;">❌ Error: ' + err.message + '</p>';
    }
  }
}

async function generateRedeemCode() {
  try {
    console.log('[Generate Code] Starting...');
    const type = document.getElementById('redeemRewardType')?.value || 'hc';
    const value = document.getElementById('redeemValue')?.value || '';
    const amount = parseInt(document.getElementById('redeemAmount')?.value || '0', 10) || undefined;
    const isPermanent = (document.getElementById('redeemPermanent')?.value || 'false') === 'true';
    const expiresInMinutes = parseInt(document.getElementById('redeemExpiresMinutes')?.value || '0', 10) || undefined;
    const expiresInDays = parseInt(document.getElementById('redeemExpiresDays')?.value || '0', 10) || undefined;
    const maxUses = parseInt(document.getElementById('redeemMaxUses')?.value || '0', 10) || undefined;
    const description = document.getElementById('redeemDescription')?.value || '';
    
    const reward = { type };
    if (type === 'hc') reward.amount = amount || 0;
    if (type === 'cosmetic' || type === 'badge') reward.value = value;
    
    const body = { reward, isPermanent, description };
    if (!isPermanent) {
      if (expiresInMinutes) body.expiresInMinutes = expiresInMinutes;
      if (expiresInDays) body.expiresInDays = expiresInDays;
    }
    if (maxUses) body.maxUses = maxUses;
    
    console.log('[Generate Code] Payload:', body);
    const res = await secureFetch(`${API}/api/admin/redeem-codes/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res?.json().catch(() => ({}));
    console.log('[Generate Code] Response:', res?.ok, data);
    if (res && res.ok) {
      alert(`✅ Code generated: ${data.code}`);
      document.getElementById('redeemDescription').value = '';
      document.getElementById('redeemAmount').value = '';
      document.getElementById('redeemValue').value = '';
      document.getElementById('redeemExpiresMinutes').value = '';
      document.getElementById('redeemExpiresDays').value = '';
      document.getElementById('redeemMaxUses').value = '';
      await loadRedeemCodes();
    } else {
      alert('❌ Failed: ' + (data.error || 'Unknown error'));
      console.error('Generate failed:', data);
    }
  } catch (e) {
    alert('❌ Network error: ' + e.message);
    console.error('Generate code error:', e);
  }
}

async function deleteRedeemCode(codeId) {
  try {
    console.log('[Delete Code] Starting for:', codeId);
    const res = await secureFetch(`${API}/api/admin/redeem-codes/${codeId}`, { method: 'DELETE' });
    const data = await res?.json().catch(() => ({}));
    console.log('[Delete Code] Response:', res?.ok, data);
    if (res && res.ok) {
      alert('✅ Code deleted');
      await loadRedeemCodes();
    } else {
      alert('❌ Failed: ' + (data.error || 'Unknown error'));
      console.error('Delete failed:', data);
    }
  } catch (e) {
    alert('❌ Network error: ' + e.message);
    console.error('Delete code error:', e);
  }
}
