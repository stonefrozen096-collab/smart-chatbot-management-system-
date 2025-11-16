/* ===============================
   ADMIN PANEL – FRONTEND LOGIC (API Connected)
=============================== */

/* ========== SECTION SWITCHING ========== */
function showSection(id) {
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
}

/* ========== LOGOUT ========== */
function logout() {
    alert("Logged out successfully!");
    window.location.href = "index.html";
}

/* =====================================================
   COURSE PLAN UPLOAD
===================================================== */
async function uploadPlan() {
    const fileInput = document.getElementById("fileInput");
    if (!fileInput.files.length) return alert("Please select a PDF file.");

    const file = fileInput.files[0];
    if (file.type !== "application/pdf") return alert("Only PDF files allowed.");

    const formData = new FormData();
    formData.append("file", file);

    try {
        const res = await fetch("/api/course-plans", {
            method: "POST",
            body: formData
        });
        const data = await res.json();
        alert("Course plan uploaded!");
        await displayPlans();
    } catch (err) {
        console.error(err);
        alert("Failed to upload course plan.");
    }
}

async function displayPlans() {
    try {
        const res = await fetch("/api/course-plans");
        const plans = await res.json();
        const table = document.querySelector("#course table");

        table.innerHTML = `<tr><th>File</th><th>Date</th><th>Action</th></tr>`;
        plans.forEach((p) => {
            table.innerHTML += `
                <tr>
                    <td>${p.name}</td>
                    <td>${new Date(p.date).toLocaleString()}</td>
                    <td><button onclick="deletePlan('${p.id}')">Delete</button></td>
                </tr>
            `;
        });
    } catch (err) {
        console.error(err);
    }
}

async function deletePlan(id) {
    try {
        await fetch(`/api/course-plans/${id}`, { method: "DELETE" });
        await displayPlans();
    } catch (err) {
        console.error(err);
        alert("Failed to delete course plan.");
    }
}

/* =====================================================
   GLOBAL CHAT LOCK / UNLOCK
===================================================== */
async function globalLock() {
    await fetch("/api/chat/lock/global", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "locked" })
    });
    alert("Global chat locked!");
}

async function globalUnlock() {
    await fetch("/api/chat/lock/global", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "unlocked" })
    });
    alert("Global chat unlocked!");
}

/* =====================================================
   SPECIFIC LOCK (Dept / Class / Student)
===================================================== */
async function applySpecificLock() {
    const dept = document.getElementById("deptLock").value;
    const cls = document.getElementById("classLock").value;
    const student = document.getElementById("studentLock").value || null;

    await fetch("/api/chat/lock/specific", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department: dept, class: cls, student })
    });

    alert("Specific lock applied!");
}

/* =====================================================
   AUTO-LOCK SETTINGS
===================================================== */
async function saveAutoLock() {
    const threshold = document.getElementById("autoLockSelect").value;

    await fetch("/api/chat/auto-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold })
    });

    alert("Auto-lock updated!");
}

/* =====================================================
   WARNING SYSTEM
===================================================== */
async function addWarning(student, msg) {
    await fetch("/api/warnings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student, message: msg })
    });

    await displayWarnings();
}

async function displayWarnings() {
    try {
        const res = await fetch("/api/warnings");
        const warnings = await res.json();
        const table = document.querySelector("#chat table");

        table.innerHTML = `<tr><th>Student</th><th>Violation</th><th>Date</th></tr>`;
        warnings.forEach(w => {
            table.innerHTML += `
                <tr>
                    <td>${w.student}</td>
                    <td>${w.message}</td>
                    <td>${new Date(w.date).toLocaleString()}</td>
                </tr>
            `;
        });
    } catch (err) {
        console.error(err);
    }
}

/* =====================================================
   USER MANAGEMENT (Search + Status)
===================================================== */
async function loadUsers() {
    try {
        const res = await fetch("/api/users");
        const users = await res.json();
        const table = document.querySelector("#users table");

        table.innerHTML = `<tr><th>Name</th><th>Email</th><th>Role</th></tr>`;
        users.forEach(u => {
            table.innerHTML += `
                <tr>
                    <td>${u.name}</td>
                    <td>${u.email}</td>
                    <td>${u.role}</td>
                </tr>
            `;
        });
    } catch (err) {
        console.error(err);
    }
}

function searchUsers() {
    const input = document.querySelector("#users input").value.toLowerCase();
    document.querySelectorAll("#users table tr").forEach((row, i) => {
        if (i === 0) return; // skip header
        const name = row.children[0].innerText.toLowerCase();
        row.style.display = name.includes(input) ? "" : "none";
    });
}

/* =====================================================
   INIT
===================================================== */
window.onload = async () => {
    await displayPlans();
    await displayWarnings();
    await loadUsers();
};
