/* =====================================================
   SECURE ADMIN PANEL JS (with token + CSRF protection)
===================================================== */

console.log("%c SECURE ADMIN PANEL JS LOADED ", "background:#0f0;color:#000;padding:4px;border-radius:4px;");


// ========================
// SECURITY LAYER
// ========================

async function secureFetch(url, options = {}) {

    options.credentials = "include";                   // Send HTTP-only cookie
    options.headers = options.headers || {};
    options.headers["X-CSRF-Token"] = getCSRF();       // Protect from CSRF attacks

    let res = await fetch(url, options);

    // If unauthorized → auto logout
    if (res.status === 401 || res.status === 403) {
        alert("Session expired. Please log in again.");
        window.location.href = "/index.html";
        return;
    }

    return res;
}

function getCSRF() {
    const token = document.cookie.split("; ")
        .find(row => row.startsWith("csrfToken="));
    return token ? token.split("=")[1] : "";
}

// Prevent HTML injection
function escapeHTML(str) {
    return str.replace(/[&<>"']/g, m =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
    );
}


// ========================
// SECTION SWITCHING
// ========================
function showSection(id) {
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
}


// ========================
// LOGOUT
// ========================
async function logout() {
    await secureFetch("/api/admin/logout", { method: "POST" });
    window.location.href = "index.html";
}


// =====================================================
// COURSE PLAN UPLOAD (SECURE)
// =====================================================
async function uploadPlan() {
    const fileInput = document.getElementById("fileInput");
    if (!fileInput.files.length) return alert("Select a PDF file.");

    const file = fileInput.files[0];
    if (file.type !== "application/pdf") return alert("Only PDF allowed.");

    const formData = new FormData();
    formData.append("file", file);

    try {
        const res = await secureFetch("/api/course-plans", {
            method: "POST",
            body: formData
        });

        alert("Uploaded successfully!");
        await displayPlans();
    } catch (err) {
        console.error(err);
        alert("Upload failed.");
    }
}

async function displayPlans() {
    const res = await secureFetch("/api/course-plans");
    const plans = await res.json();

    const table = document.querySelector("#coursePlansTable");
    table.innerHTML = `<tr><th>File</th><th>Date</th><th>Action</th></tr>`;

    plans.forEach(p => {
        table.innerHTML += `
            <tr>
                <td>${escapeHTML(p.name)}</td>
                <td>${new Date(p.date).toLocaleString()}</td>
                <td><button onclick="deletePlan('${p.id}')">Delete</button></td>
            </tr>
        `;
    });
}

async function deletePlan(id) {
    await secureFetch(`/api/course-plans/${id}`, {
        method: "DELETE"
    });
    await displayPlans();
}


// =====================================================
// GLOBAL CHAT LOCK
// =====================================================
async function globalLock() {
    await secureFetch("/api/chat/lock/global", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "locked" })
    });

    alert("Global chat locked.");
}

async function globalUnlock() {
    await secureFetch("/api/chat/lock/global", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "unlocked" })
    });

    alert("Global chat unlocked.");
}


// =====================================================
// SPECIFIC LOCK
// =====================================================
async function applySpecificLock() {
    const dept = document.getElementById("deptLock").value;
    const cls = document.getElementById("classLock").value;
    const student = document.getElementById("studentLock").value || null;

    await secureFetch("/api/chat/lock/specific", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department: dept, class: cls, student })
    });

    alert("Lock applied.");
}


// =====================================================
// AUTO LOCK
// =====================================================
async function saveAutoLock() {
    const threshold = document.getElementById("autoLockSelect").value;

    await secureFetch("/api/chat/auto-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold })
    });

    alert("Updated.");
}


// =====================================================
// WARNINGS
// =====================================================
async function displayWarnings() {
    const res = await secureFetch("/api/warnings");
    const warnings = await res.json();

    const table = document.querySelector("#warningsTable");
    table.innerHTML = `<tr><th>Student</th><th>Violation</th><th>Date</th></tr>`;

    warnings.forEach(w => {
        table.innerHTML += `
            <tr>
                <td>${escapeHTML(w.student)}</td>
                <td>${escapeHTML(w.message)}</td>
                <td>${new Date(w.date).toLocaleString()}</td>
            </tr>
        `;
    });
}


// =====================================================
// USER MANAGEMENT
// =====================================================
async function loadUsers() {
    const res = await secureFetch("/api/users");
    const users = await res.json();

    const table = document.querySelector("#usersTable");
    table.innerHTML = `<tr><th>Name</th><th>Email</th><th>Role</th></tr>`;

    users.forEach(u => {
        table.innerHTML += `
            <tr>
                <td>${escapeHTML(u.name)}</td>
                <td>${escapeHTML(u.email)}</td>
                <td>${escapeHTML(u.role)}</td>
            </tr>
        `;
    });
}


// ---------------------------- SEARCH ----------------------------
function searchUsers() {
    const input = document.getElementById("userSearchInput").value.toLowerCase();

    document.querySelectorAll("#usersTable tr").forEach((row, i) => {
        if (i === 0) return;
        const name = row.children[0].innerText.toLowerCase();
        row.style.display = name.includes(input) ? "" : "none";
    });
}


// ========================
// INIT LOADER
// ========================
window.onload = async () => {
    await displayPlans();
    await displayWarnings();
    await loadUsers();
};
