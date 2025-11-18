/* =====================================================
   CENTRAL API MODULE — Secure Client → Server Connector
===================================================== */

const API_BASE = "https://smart-chatbot-backend-w5tq.onrender.com";

let CSRF_TOKEN = null;

// ---------------------- CSRF Handling ----------------------
export function setCSRF(token) {
    CSRF_TOKEN = token;
}

export function getCSRF() {
    return CSRF_TOKEN;
}

// wrapper for fetch that includes CSRF automatically
async function fetchWithCSRF(url, options = {}) {
    const csrf = await getCSRF();
    options.credentials = "include";
    options.headers = {
        ...options.headers,
        "x-csrf-token": csrf
    };
    return fetch(url, options);
}

// ---------------------- AUTH ----------------------
export async function login(roll, password) {
    return fetchWithCSRF(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roll, password })
    }).then(res => res.json());
}

export async function register(user) {
    return fetchWithCSRF(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user)
    }).then(res => res.json());
}

export async function getProfile() {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
        credentials: "include"
    });
    return res.json();
}

// ---------------------- COURSE PLANS (Admin) ----------------------
export async function uploadCoursePlan(file) {
    const formData = new FormData();
    formData.append("file", file);

    return fetchWithCSRF(`${API_BASE}/api/admin/course-plans`, {
        method: "POST",
        body: formData
    }).then(res => res.json());
}

export async function fetchCoursePlans() {
    const res = await fetch(`${API_BASE}/api/admin/course-plans`, {
        credentials: "include"
    });
    return res.json();
}

export async function deleteCoursePlan(id) {
    return fetchWithCSRF(`${API_BASE}/api/admin/course-plans/${id}`, {
        method: "DELETE"
    }).then(res => res.json());
}

// ---------------------- CHAT LOCK SYSTEM (Admin) ----------------------
export async function setGlobalLock(state) {
    return fetchWithCSRF(`${API_BASE}/api/admin/chat/lock/global`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state })
    }).then(res => res.json());
}

export async function setSpecificLock(data) {
    return fetchWithCSRF(`${API_BASE}/api/admin/chat/lock/specific`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    }).then(res => res.json());
}

export async function setAutoLock(threshold) {
    return fetchWithCSRF(`${API_BASE}/api/admin/chat/auto-lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold })
    }).then(res => res.json());
}

// ---------------------- WARNINGS (Admin) ----------------------
export async function addWarning(student, message) {
    return fetchWithCSRF(`${API_BASE}/api/admin/warnings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student, message })
    }).then(res => res.json());
}

export async function fetchWarnings() {
    const res = await fetch(`${API_BASE}/api/admin/warnings`, {
        credentials: "include"
    });
    return res.json();
}

// ---------------------- CHATBOT (Students) ----------------------
export async function askChatbot(prompt) {
    return fetchWithCSRF(`${API_BASE}/api/chatbot/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
    }).then(res => res.json()).then(data => data.answer || "No response");
}

// ---------------------- NOTICES (Admin) ----------------------
export async function fetchNotices() {
    const res = await fetch(`${API_BASE}/api/admin/notices`, {
        credentials: "include"
    });
    return res.json();
}

export async function createNotice(payload) {
    return fetchWithCSRF(`${API_BASE}/api/admin/notices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    }).then(res => res.json());
}

export async function updateNotice(id, payload) {
    return fetchWithCSRF(`${API_BASE}/api/admin/notices/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    }).then(res => res.json());
}

export async function deleteNotice(id) {
    return fetchWithCSRF(`${API_BASE}/api/admin/notices/${id}`, {
        method: "DELETE"
    }).then(res => res.json());
}

// ---------------------- USERS (Admin) ----------------------
export async function fetchUsers() {
    const res = await fetch(`${API_BASE}/api/admin/users`, {
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

// ---------------------- BADGES (Admin) ----------------------
export async function fetchBadges() {
    const res = await fetch(`${API_BASE}/api/admin/badges`, {
        credentials: "include"
    });
    return res.json();
}

export async function createBadge(payload) {
    return fetchWithCSRF(`${API_BASE}/api/admin/badges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    }).then(res => res.json());
}

export async function assignBadge(email, badgeId) {
    return fetchWithCSRF(`${API_BASE}/api/admin/badges/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, badgeId })
    }).then(res => res.json());
}
