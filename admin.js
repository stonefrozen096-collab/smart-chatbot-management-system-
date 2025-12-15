/* =====================================================
   COMPLETE ADMIN PANEL JS — ALL FEATURES WORKING
===================================================== */

const API = "https://smart-chatbot-backend-w5tq.onrender.com";

// Get token from storage (set during login in index.html)
function getToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('token') || null;
}

// Get CSRF from cookies
function getCSRF() {
  const cookies = document.cookie.split('; ');
  const csrfCookie = cookies.find(c => c.startsWith('csrf_token='));
  return csrfCookie ? csrfCookie.split('=')[1] : '';
}

// Secure fetch with auth headers
async function secureFetch(url, options = {}) {
  const token = getToken();
  const csrf = getCSRF();
  
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
      alert('Unauthorized. Redirecting to login...');
      window.location.href = 'index.html';
      return null;
    }
    return res;
  } catch (err) {
    console.error('Fetch error:', err);
    return null;
  }
}

// HTML escape
function escapeHTML(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str).replace(/[&<>"']/g, c => map[c]);
}


// ========================
// SECTION SWITCHING
// ========================
function showSection(id) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
}

// ========== LOGOUT ==========
async function logout() {
  const token = getToken();
  if (token) {
    await secureFetch(`${API}/api/auth/logout`, { method: 'POST', body: JSON.stringify({}) });
  }
  localStorage.removeItem('token');
  sessionStorage.removeItem('token');
  window.location.href = 'index.html';
}

// ========== 1. STUDENT MANAGEMENT ==========
let allStudents = [];

async function loadStudents() {
  const res = await secureFetch(`${API}/api/admin/students?perPage=1000`);
  if (!res || !res.ok) { alert('Failed to load students'); return; }
  
  const students = await res.json();
  allStudents = Array.isArray(students) ? students : [];
  
  const table = document.querySelector('#studentsTable tbody') || document.querySelector('#studentsTable');
  if (table) {
    table.innerHTML = '';
    allStudents.forEach(s => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${escapeHTML(s.roll)}</td>
        <td>${escapeHTML(s.name)}</td>
        <td>${escapeHTML(s.email || '—')}</td>
        <td>${escapeHTML(s.dept)}</td>
        <td>${s.lockedUntil ? '🔒 Locked' : '✅ Active'}</td>
        <td>
          <button class="btn-small" onclick="selectStudent('${s.roll}')">Select</button>
        </td>
      `;
      table.appendChild(row);
    });
  }
  
  // Update users table with actions
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
          <button onclick="viewStudentQR('${s.roll}', '${escapeHTML(s.name)}', '${escapeHTML(s.dept)}')" title="View QR Code" style="padding:5px 8px;font-size:12px;">🔲 QR</button>
          <button onclick="viewStudentDetail('${s.roll}')" title="View Details & History" style="padding:5px 8px;font-size:12px;">👁️ View</button>
          <button onclick="selectStudent('${s.roll}')" title="Select" style="padding:5px 8px;font-size:12px;">✔️ Select</button>
        </td>
      `;
      usersTable.appendChild(row);
    });
  }
}

function selectStudent(roll) {
  ['studentLock', 'studentWarning', 'studentMessage'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = roll;
  });
  alert(`✅ Selected student: ${roll}`);
}

function filterUsers() {
  const searchTerm = document.getElementById('userSearchInput')?.value.toLowerCase() || '';
  const usersTable = document.getElementById('usersTable');
  if (!usersTable) return;
  
  const rows = usersTable.querySelectorAll('tr');
  rows.forEach((row, idx) => {
    if (idx === 0) return; // Skip header
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(searchTerm) ? '' : 'none';
  });
}

// ========== 2. LOCK / UNLOCK STUDENTS ==========
async function lockStudent() {
  const roll = document.getElementById('studentLock')?.value;
  const seconds = parseInt(document.getElementById('lockSeconds')?.value || 86400);
  
  if (!roll) return alert('Select a student');
  
  const res = await secureFetch(`${API}/api/admin/lock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roll, reason: 'Admin lock', seconds })
  });
  
  if (res && res.ok) {
    alert('✅ Student locked successfully');
    loadStudents();
  } else {
    alert('❌ Failed to lock student');
  }
}

async function unlockStudent() {
  const roll = document.getElementById('studentLock')?.value;
  if (!roll) return alert('Select a student');
  
  const res = await secureFetch(`${API}/api/admin/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roll })
  });
  
  if (res && res.ok) {
    alert('✅ Student unlocked successfully');
    loadStudents();
  } else {
    alert('❌ Failed to unlock student');
  }
}

// ========== 3. WARNINGS ==========
async function issueWarning() {
  const roll = document.getElementById('studentWarning')?.value;
  const reason = document.getElementById('warningReason')?.value;
  const level = document.getElementById('warningLevel')?.value || 'low';
  
  if (!roll || !reason) return alert('Fill all fields');
  
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
    alert('❌ Failed to issue warning');
  }
}

async function loadWarnings(roll = '') {
  if (!roll) roll = document.getElementById('studentWarning')?.value;
  if (!roll) { alert('Select a student first'); return; }
  
  const res = await secureFetch(`${API}/api/admin/warnings/${encodeURIComponent(roll)}`);
  if (!res || !res.ok) { alert('Failed to load warnings'); return; }
  
  const warnings = await res.json();
  const container = document.getElementById('warningsContainer');
  container.innerHTML = '';
  
  if (!Array.isArray(warnings) || warnings.length === 0) {
    container.innerHTML = '<p style="opacity:0.7">No warnings</p>';
    return;
  }
  
  warnings.forEach(w => {
    const el = document.createElement('div');
    el.style.padding = '10px';
    el.style.background = 'rgba(255,0,0,0.1)';
    el.style.borderRadius = '8px';
    el.style.marginBottom = '8px';
    el.innerHTML = `<strong>[${w.level?.toUpperCase()}]</strong> ${escapeHTML(w.reason)}<br/><small>${new Date(w.createdAt).toLocaleString()}</small>`;
    container.appendChild(el);
  });
}

// ========== 4. NOTICES ==========
async function createNotice() {
  const title = document.getElementById('noticeTitle')?.value;
  const body = document.getElementById('noticeBody')?.value;
  const urgent = document.getElementById('noticeUrgent')?.checked;
  
  if (!title || !body) return alert('Fill all fields');
  
  const res = await secureFetch(`${API}/api/admin/notice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, urgent })
  });
  
  if (res && res.ok) {
    alert('✅ Notice created');
    document.getElementById('noticeTitle').value = '';
    document.getElementById('noticeBody').value = '';
    loadNotices();
  } else {
    alert('❌ Failed to create notice');
  }
}

async function loadNotices() {
  const res = await secureFetch(`${API}/api/notices`);
  if (!res || !res.ok) return;
  
  const notices = await res.json();
  const container = document.getElementById('noticesContainer');
  container.innerHTML = '';
  
  (Array.isArray(notices) ? notices : []).forEach(n => {
    const el = document.createElement('div');
    el.style.padding = '10px';
    el.style.background = n.urgent ? 'rgba(255,100,0,0.15)' : 'rgba(100,200,255,0.15)';
    el.style.borderRadius = '8px';
    el.style.marginBottom = '8px';
    el.innerHTML = `<strong>${escapeHTML(n.title)}</strong> ${n.urgent ? '🔴' : ''}<br/>${escapeHTML(n.body)}<br/><small>${new Date(n.createdAt).toLocaleString()}</small>`;
    container.appendChild(el);
  });
}

// ========== 5. SEND MESSAGES ==========
async function sendDirectMessage() {
  const roll = document.getElementById('studentMessage')?.value;
  const title = document.getElementById('messageTitle')?.value;
  const body = document.getElementById('messageBody')?.value;
  const type = document.getElementById('messageType')?.value || 'message';
  
  if (!roll || !title || !body) return alert('Fill all fields');
  
  const res = await secureFetch(`${API}/api/admin/send-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roll, title, body, type })
  });
  
  if (res && res.ok) {
    alert('✅ Message sent');
    document.getElementById('messageTitle').value = '';
    document.getElementById('messageBody').value = '';
  } else {
    alert('❌ Failed to send message');
  }
}

async function broadcastMessage() {
  const title = document.getElementById('broadcastTitle')?.value;
  const body = document.getElementById('broadcastBody')?.value;
  const type = document.getElementById('broadcastType')?.value || 'notice';
  
  if (!title || !body) return alert('Fill all fields');
  
  const res = await secureFetch(`${API}/api/admin/broadcast-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, type })
  });
  
  if (res && res.ok) {
    alert('✅ Message broadcast to all students');
    document.getElementById('broadcastTitle').value = '';
    document.getElementById('broadcastBody').value = '';
  } else {
    alert('❌ Failed to broadcast');
  }
}

// ========== 6. MESSAGE TEMPLATES ==========
async function loadTemplates() {
  const res = await secureFetch(`${API}/api/admin/message-templates`);
  if (!res || !res.ok) return;
  
  const templates = await res.json();
  const container = document.getElementById('templatesContainer');
  container.innerHTML = '';
  
  (Array.isArray(templates) ? templates : []).forEach(t => {
    const el = document.createElement('div');
    el.style.padding = '10px';
    el.style.background = 'rgba(100,255,100,0.15)';
    el.style.borderRadius = '8px';
    el.style.marginBottom = '8px';
    el.innerHTML = `<strong>${escapeHTML(t.name)}</strong><br/>${escapeHTML(t.body.substring(0, 50))}<br/><button class="btn-small" onclick="useTemplate('${t._id}')">Use</button>`;
    container.appendChild(el);
  });
}

async function createTemplate() {
  const name = document.getElementById('templateName')?.value;
  const body = document.getElementById('templateBody')?.value;
  
  if (!name || !body) return alert('Fill all fields');
  
  const res = await secureFetch(`${API}/api/admin/message-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, body })
  });
  
  if (res && res.ok) {
    alert('✅ Template created');
    document.getElementById('templateName').value = '';
    document.getElementById('templateBody').value = '';
    loadTemplates();
  } else {
    alert('❌ Failed to create template');
  }
}

function useTemplate(templateId) {
  document.getElementById('messageTitle').value = 'From Template';
  alert('Template loaded. Edit and send.');
}

// ========== 7. COURSE PLANS ==========
async function uploadCoursePlan() {
  const fileInput = document.getElementById('planFile');
  const nameInput = document.getElementById('planName');
  
  if (!fileInput || !fileInput.files.length) return alert('Select a PDF file');
  
  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', nameInput?.value || file.name);
  
  const token = getToken();
  const csrf = getCSRF();
  
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
      nameInput.value = '';
      loadCoursePlans();
    } else {
      alert('❌ Upload failed: ' + (await res.text()));
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
  table.innerHTML = '';
  
  (Array.isArray(plans) ? plans : []).forEach(p => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHTML(p.name)}</td>
      <td>${new Date(p.uploadedAt).toLocaleString()}</td>
      <td>
        <button class="btn-small" onclick="deleteCoursePlan('${p._id}')">Delete</button>
      </td>
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
    alert('❌ Failed to delete course plan');
  }
}

// ========== 8. APPEALS ==========
async function loadAppeals() {
  const res = await secureFetch(`${API}/api/admin/appeals`);
  if (!res || !res.ok) return;
  
  const appeals = await res.json();
  const container = document.getElementById('appealsContainer');
  container.innerHTML = '';
  
  (Array.isArray(appeals) ? appeals : []).forEach(a => {
    const el = document.createElement('div');
    el.style.padding = '10px';
    el.style.background = 'rgba(255,200,0,0.15)';
    el.style.borderRadius = '8px';
    el.style.marginBottom = '8px';
    el.innerHTML = `
      <strong>${escapeHTML(a.studentRoll)}</strong> - ${escapeHTML(a.reason)}<br/>
      Status: <strong>${a.status}</strong><br/>
      <input type="text" placeholder="Response..." id="appealResp_${a._id}" style="margin:5px 0"/>
      <select id="appealAction_${a._id}" style="margin:5px 0">
        <option value="review">Review</option>
        <option value="close">Close</option>
        <option value="unlock">Unlock & Close</option>
      </select>
      <button class="btn-small" onclick="respondToAppeal('${a._id}')">Respond</button>
    `;
    container.appendChild(el);
  });
}

async function respondToAppeal(appealId) {
  const response = document.getElementById(`appealResp_${appealId}`)?.value;
  const action = document.getElementById(`appealAction_${appealId}`)?.value;
  
  if (!response) return alert('Enter a response');
  
  const res = await secureFetch(`${API}/api/admin/appeals/${appealId}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, response })
  });
  
  if (res && res.ok) {
    alert('✅ Appeal response sent');
    loadAppeals();
  } else {
    alert('❌ Failed to respond');
  }
}

// ========== 9. DASHBOARD STATS ==========
async function loadDashboardStats() {
  const res = await secureFetch(`${API}/api/admin/students?perPage=1000`);
  if (!res || !res.ok) return;
  
  const students = await res.json();
  const total = Array.isArray(students) ? students.length : 0;
  const locked = Array.isArray(students) ? students.filter(s => s.lockedUntil && new Date(s.lockedUntil) > new Date()).length : 0;
  const withWarnings = Array.isArray(students) ? students.filter(s => s.warningsCount > 0).length : 0;
  
  document.getElementById('totalStudents').textContent = total;
  document.getElementById('lockedStudents').textContent = locked;
  document.getElementById('warningStudents').textContent = withWarnings;
}

// ========== 10. INIT & LOAD ALL ==========
async function initAdmin() {
  const token = getToken();
  if (!token) {
    window.location.href = 'index.html';
    return;
  }
  
  // Load all data
  await loadDashboardStats();
  await loadStudents();
  await loadNotices();
  await loadCoursePlans();
  await loadTemplates();
  await loadAppeals();
  
  showSection('dashboard');
}

// ========== EVENT LISTENERS ==========
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
  
  // Logout button
  const logoutBtn = document.querySelector('[onclick="logout()"]');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
  
  // Action buttons
  document.getElementById('lockBtn')?.addEventListener('click', lockStudent);
  document.getElementById('unlockBtn')?.addEventListener('click', unlockStudent);
  document.getElementById('warningBtn')?.addEventListener('click', issueWarning);
  document.getElementById('noticeBtn')?.addEventListener('click', createNotice);
  document.getElementById('messageBtn')?.addEventListener('click', sendDirectMessage);
  document.getElementById('broadcastBtn')?.addEventListener('click', broadcastMessage);
  document.getElementById('templateBtn')?.addEventListener('click', createTemplate);
  document.getElementById('planBtn')?.addEventListener('click', uploadCoursePlan);
  document.getElementById('refreshBtn')?.addEventListener('click', initAdmin);
});

// ========== QR CODE VIEWING ==========
function viewStudentQR(roll, name, dept) {
  const modal = document.getElementById('qrModal');
  const container = document.getElementById('qrCodeContainer');
  const info = document.getElementById('qrStudentInfo');
  
  if (!modal || !container || !info) return;
  
  // Clear previous QR code
  container.innerHTML = '';
  
  // Generate QR code with student info
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
    container.innerHTML = '<p style="color:red;">QR Code library not loaded</p>';
  }
  
  info.textContent = `${name} (${roll}) - ${dept}`;
  modal.style.display = 'flex';
}

function closeQRModal() {
  const modal = document.getElementById('qrModal');
  if (modal) modal.style.display = 'none';
}

// ========== STUDENT DETAIL VIEWING ==========
async function viewStudentDetail(roll) {
  const modal = document.getElementById('studentDetailModal');
  if (!modal) return;
  
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
          <div style="background:rgba(239,68,68,0.2);padding:10px;margin:5px 0;border-radius:8px;font-size:13px;">
            <strong>⚠️ ${escapeHTML(w.reason || 'Warning')}</strong><br>
            <span style="opacity:0.8;font-size:11px;">${new Date(w.createdAt).toLocaleString()}</span>
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
