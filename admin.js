/* ===============================
   ADMIN PANEL – FRONTEND LOGIC
   Backend API can be connected later
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
   COURSE PLAN UPLOAD (Frontend Only - LocalStorage)
===================================================== */
function uploadPlan() {
    let fileInput = document.getElementById("fileInput");
    if (!fileInput.files.length) {
        alert("Please select a PDF file.");
        return;
    }

    let file = fileInput.files[0];

    if (file.type !== "application/pdf") {
        alert("Only PDF files allowed.");
        return;
    }

    let plans = JSON.parse(localStorage.getItem("coursePlans") || "[]");

    plans.push({
        name: file.name,
        date: new Date().toLocaleString()
    });

    localStorage.setItem("coursePlans", JSON.stringify(plans));
    alert("Course plan uploaded!");

    displayPlans();
}

function displayPlans() {
    let table = document.querySelector("#course table");
    let plans = JSON.parse(localStorage.getItem("coursePlans") || "[]");

    table.innerHTML = `
        <tr><th>File</th><th>Date</th><th>Action</th></tr>
    `;

    plans.forEach((p, i) => {
        table.innerHTML += `
            <tr>
                <td>${p.name}</td>
                <td>${p.date}</td>
                <td><button onclick="deletePlan(${i})">Delete</button></td>
            </tr>
        `;
    });
}

function deletePlan(index) {
    let plans = JSON.parse(localStorage.getItem("coursePlans") || "[]");
    plans.splice(index, 1);
    localStorage.setItem("coursePlans", JSON.stringify(plans));
    displayPlans();
}

/* =====================================================
   GLOBAL CHAT LOCK / UNLOCK
===================================================== */
function globalLock() {
    localStorage.setItem("chatLockGlobal", "locked");
    alert("Global chat locked!");
}

function globalUnlock() {
    localStorage.setItem("chatLockGlobal", "unlocked");
    alert("Global chat unlocked!");
}

/* =====================================================
   SPECIFIC LOCK (Dept / Class / Student)
===================================================== */
function applySpecificLock() {
    const dept = document.getElementById("deptLock").value;
    const cls = document.getElementById("classLock").value;
    const student = document.getElementById("studentLock").value;

    let lockData = {
        department: dept,
        class: cls,
        student: student || "Entire Class"
    };

    localStorage.setItem("specificLock", JSON.stringify(lockData));

    alert("Lock applied successfully!");
}

/* =====================================================
   AUTO-LOCK SETTINGS
===================================================== */
function saveAutoLock() {
    const value = document.getElementById("autoLockSelect").value;
    localStorage.setItem("autoLock", value);
    alert("Auto-lock updated!");
}

/* =====================================================
   WARNING SYSTEM
===================================================== */
function addWarning(student, msg) {
    let warnings = JSON.parse(localStorage.getItem("warnings") || "[]");

    warnings.push({
        student: student,
        message: msg,
        date: new Date().toLocaleString()
    });

    localStorage.setItem("warnings", JSON.stringify(warnings));
    displayWarnings();
}

function displayWarnings() {
    let table = document.querySelector("#chat table");
    let warnings = JSON.parse(localStorage.getItem("warnings") || "[]");

    table.innerHTML = `
        <tr><th>Student</th><th>Violation</th><th>Date</th></tr>
    `;

    warnings.forEach(w => {
        table.innerHTML += `
            <tr>
                <td>${w.student}</td>
                <td>${w.message}</td>
                <td>${w.date}</td>
            </tr>
        `;
    });
}

/* =====================================================
   USER MANAGEMENT (Search + Status)
===================================================== */
function searchUsers() {
    let input = document.querySelector("#users input").value.toLowerCase();
    let rows = document.querySelectorAll("#users table tr");

    rows.forEach((row, i) => {
        if (i === 0) return; // Skip header

        let name = row.children[0].innerText.toLowerCase();
        row.style.display = name.includes(input) ? "" : "none";
    });
}

/* Auto-load data when admin panel opens */
window.onload = () => {
    displayPlans();
    displayWarnings();
};
