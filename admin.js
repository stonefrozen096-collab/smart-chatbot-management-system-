/* =====================================================
   SECURE ADMIN PANEL JS (with token + CSRF protection)
===================================================== */

console.log("%c SECURE ADMIN PANEL JS LOADED ", "background:#0f0;color:#000;padding:4px;border-radius:4px;");


// ========================
// SECURITY LAYER
// ========================

async function secureFetch(url, options = {}) {
    options.credentials = "include";                   // Send cookies (CSRF)
    options.headers = options.headers || {};
    // CSRF header name expected by server
    options.headers["x-csrf-token"] = getCSRF();
    // Attach JWT if present
    const token = sessionStorage.getItem("token");
    if (token) options.headers["Authorization"] = "Bearer " + token;

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

    // Backend expects JSON with name; no file upload handler present
    try {
        const res = await secureFetch("/api/course-plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: file.name })
        });
        if (!res.ok) throw new Error("Upload failed");
        alert("Uploaded successfully!");
        await displayPlans();
    } catch (err) {
        console.error(err);
        alert("Upload failed.");
    }
}

async function displayPlans() {
    const res = await secureFetch("/api/course-plan");
    const plans = await res.json();

    const table = document.querySelector("#coursePlansTable");
    table.innerHTML = `<tr><th>File</th><th>Uploaded</th></tr>`;

    plans.forEach(p => {
        table.innerHTML += `
            <tr>
                <td>${escapeHTML(p.name || "")}</td>
                <td>${new Date(p.uploadedAt).toLocaleString()}</td>
            </tr>
        `;
    });
}


// =====================================================
// GLOBAL CHAT LOCK
// =====================================================
async function globalLock() {
    alert("Global lock requires server API key. Disabled here.");
}

async function globalUnlock() {
    alert("Global unlock requires server API key. Disabled here.");
}


// =====================================================
// SPECIFIC LOCK
// =====================================================
async function applySpecificLock() {
    const dept = document.getElementById("deptLock").value;
    const cls = document.getElementById("classLock").value;
    const student = document.getElementById("studentLock").value || null;
    if (!student) return alert("Provide a student roll to lock.");
    const seconds = 24 * 3600; // 1 day default
    const reason = `manual-lock (${dept}-${cls})`;
    const res = await secureFetch("/api/admin/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roll: student, reason, seconds })
    });
    if (!res.ok) return alert("Failed to apply lock");
    alert("Lock applied.");
}


// =====================================================
// AUTO LOCK
// =====================================================
async function saveAutoLock() {
    alert("Auto-lock policy managed server-side. No client endpoint.");
}


// =====================================================
// WARNINGS
// =====================================================
async function displayWarnings() {
    // Show current warning counts from students list
    const res = await secureFetch("/api/admin/students");
    const students = await res.json();
    const table = document.querySelector("#warningsTable");
    table.innerHTML = `<tr><th>Roll</th><th>Name</th><th>Warnings Count</th><th>Locked Until</th></tr>`;
    students.forEach(s => {
        table.innerHTML += `
            <tr>
                <td>${escapeHTML(s.roll || "")}</td>
                <td>${escapeHTML(s.name || "")}</td>
                <td>${escapeHTML(String(s.warningsCount ?? 0))}</td>
                <td>${s.lockedUntil ? new Date(s.lockedUntil).toLocaleString() : ""}</td>
            </tr>
        `;
    });
}


// =====================================================
// USER MANAGEMENT
// =====================================================
async function loadUsers() {
    const res = await secureFetch("/api/admin/students");
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
