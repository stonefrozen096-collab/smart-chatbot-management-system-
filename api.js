/* =====================================================
   CENTRAL API MODULE — Secure Client → Server Connector
===================================================== */

const API_BASE = "https://smart-chatbot-backend-w5tq.onrender.com";
/* =====================================================
   AUTH (Login / Register / Profile)
===================================================== */
export async function login(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password })
    });
    return res.json();
}

export async function register(user) {
    const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(user)
    });
    return res.json();
}

export async function getProfile() {
    const res = await fetch(`${API_BASE}/auth/me`, {
        credentials: "include"
    });
    return res.json();
}

/* =====================================================
   COURSE PLANS — Admin Only
===================================================== */
export async function uploadCoursePlan(file) {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${API_BASE}/admin/course-plans`, {
        method: "POST",
        credentials: "include",
        body: formData
    });
    return res.json();
}

export async function fetchCoursePlans() {
    const res = await fetch(`${API_BASE}/admin/course-plans`, {
        credentials: "include"
    });
    return res.json();
}

export async function deleteCoursePlan(id) {
    const res = await fetch(`${API_BASE}/admin/course-plans/${id}`, {
        method: "DELETE",
        credentials: "include"
    });
    return res.json();
}

/* =====================================================
   CHAT LOCK SYSTEM — Admin Only
===================================================== */
export async function setGlobalLock(state) {
    const res = await fetch(`${API_BASE}/admin/chat/lock/global`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ state })
    });
    return res.json();
}

export async function setSpecificLock(data) {
    const res = await fetch(`${API_BASE}/admin/chat/lock/specific`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data)
    });
    return res.json();
}

export async function setAutoLock(threshold) {
    const res = await fetch(`${API_BASE}/admin/chat/auto-lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ threshold })
    });
    return res.json();
}

/* =====================================================
   WARNINGS — Admin Only
===================================================== */
export async function addWarning(student, message) {
    const res = await fetch(`${API_BASE}/admin/warnings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ student, message })
    });
    return res.json();
}

export async function fetchWarnings() {
    const res = await fetch(`${API_BASE}/admin/warnings`, {
        credentials: "include"
    });
    return res.json();
}

/* =====================================================
   CHATBOT — Students
===================================================== */
export async function askChatbot(prompt) {
    const res = await fetch(`${API_BASE}/chatbot/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt })
    });
    return (await res.json()).answer || "No response";
}

/* =====================================================
   NOTICES — Admin
===================================================== */
export async function fetchNotices() {
    const res = await fetch(`${API_BASE}/admin/notices`, {
        credentials: "include"
    });
    return res.json();
}

export async function createNotice(payload) {
    const res = await fetch(`${API_BASE}/admin/notices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
    });
    return res.json();
}

export async function updateNotice(id, payload) {
    const res = await fetch(`${API_BASE}/admin/notices/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
    });
    return res.json();
}

export async function deleteNotice(id) {
    const res = await fetch(`${API_BASE}/admin/notices/${id}`, {
        method: "DELETE",
        credentials: "include"
    });
    return res.json();
}

/* =====================================================
   USERS — Admin Only
===================================================== */
export async function fetchUsers() {
    const res = await fetch(`${API_BASE}/admin/users`, {
        credentials: "include"
    });
    return res.json();
}

export async function searchUsers(query) {
    const users = await fetchUsers();
    return users.filter(u =>
        u.name?.toLowerCase().includes(query.toLowerCase()) ||
        u.email?.toLowerCase().includes(query.toLowerCase())
    );
}

/* =====================================================
   BADGES — Admin
===================================================== */
export async function fetchBadges() {
    const res = await fetch(`${API_BASE}/admin/badges`, {
        credentials: "include"
    });
    return res.json();
}

export async function createBadge(payload) {
    const res = await fetch(`${API_BASE}/admin/badges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
    });
    return res.json();
}

export async function assignBadge(email, badgeId) {
    const res = await fetch(`${API_BASE}/admin/badges/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, badgeId })
    });
    return res.json();
}
