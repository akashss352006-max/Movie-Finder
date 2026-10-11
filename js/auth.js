// --- Page guard, login / sign up (FastAPI backend with LocalStorage fallback) ---
const PUBLIC_PAGES = ["", "landing.html", "index.html", "signin.html"];

function currentPageName() {
    return window.location.pathname.split("/").pop();
}

function checkAuth() {
    const page = currentPageName();
    const loggedIn = sessionStorage.getItem("isLoggedIn") === "true";

    if (!loggedIn && !PUBLIC_PAGES.includes(page)) {
        window.location.replace("index.html");
    } else if (loggedIn && (page === "index.html" || page === "signin.html")) {
        window.location.replace("home.html");
    }
}

function logout() {
    sessionStorage.removeItem("isLoggedIn");
    sessionStorage.removeItem("currentUser");
    sessionStorage.removeItem("currentName");
    window.location.href = "index.html";
    return false;
}

function startSession(username, fullName) {
    sessionStorage.setItem("isLoggedIn", "true");
    sessionStorage.setItem("currentUser", username);
    sessionStorage.setItem("currentName", fullName || username);
}

// Execute check on page load
checkAuth();

// Calls the FastAPI backend. Returns null when no backend is reachable
// (e.g. pages opened from the file system or a plain static server).
async function callBackend(path, payload) {
    if (!window.location.protocol.startsWith("http")) return null;
    try {
        const response = await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const isJson = (response.headers.get("content-type") || "").includes("application/json");
        if (!isJson || response.status === 404 || response.status === 405) return null;
        const data = await response.json();
        return { ok: response.ok, data };
    } catch (err) {
        return null;
    }
}

function getLocalUsers() {
    try {
        const users = JSON.parse(localStorage.getItem("users"));
        return Array.isArray(users) ? users : [];
    } catch (e) {
        return [];
    }
}

function errorDetail(data, fallback) {
    if (!data) return fallback;
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail) && data.detail[0] && data.detail[0].msg) return data.detail[0].msg;
    return fallback;
}

// --- Form Validation & Submission Handlers ---
document.addEventListener("DOMContentLoaded", function () {
    const loginForm = document.getElementById("loginForm");
    const signinForm = document.getElementById("signinForm");

    // Default demo user for offline (LocalStorage) mode
    if (getLocalUsers().length === 0) {
        localStorage.setItem("users", JSON.stringify([{ fullName: "Luffy", username: "luffy", password: "luffy" }]));
    }

    // Login Handler
    if (loginForm) {
        loginForm.addEventListener("submit", async function (e) {
            e.preventDefault();
            const username = document.getElementById("username").value.trim();
            const password = document.getElementById("password").value;
            const errorMessage = document.getElementById("errorMessage");
            const submitBtn = loginForm.querySelector("button[type=submit]");

            errorMessage.textContent = "";
            submitBtn.disabled = true;
            submitBtn.textContent = "Logging in...";

            const result = await callBackend("/api/login", { username, password });
            if (result && result.ok) {
                startSession(result.data.user.username, result.data.user.fullName);
                window.location.href = "home.html";
                return;
            }

            // Fall back to accounts stored in this browser
            const localMatch = getLocalUsers().find(u => u.username === username && u.password === password);
            if (localMatch) {
                startSession(localMatch.username, localMatch.fullName);
                window.location.href = "home.html";
                return;
            }

            errorMessage.textContent = "Invalid username or password";
            submitBtn.disabled = false;
            submitBtn.textContent = "Login";
        });
    }

    // Sign Up Handler
    if (signinForm) {
        signinForm.addEventListener("submit", async function (e) {
            e.preventDefault();

            const fullName = document.getElementById("fullName").value.trim();
            const username = document.getElementById("regUsername").value.trim();
            const email = document.getElementById("email").value.trim();
            const password = document.getElementById("regPassword").value;
            const confirmPassword = document.getElementById("confirmPassword").value;
            const submitBtn = signinForm.querySelector("button[type=submit]");

            let isValid = true;

            // Reset Errors
            document.querySelectorAll(".error-message").forEach(el => el.textContent = "");

            if (!fullName) {
                document.getElementById("fullNameError").textContent = "Full name required";
                isValid = false;
            }

            if (!/^[A-Za-z0-9_.-]{3,30}$/.test(username)) {
                document.getElementById("usernameError").textContent = "3-30 characters: letters, numbers, _ . -";
                isValid = false;
            }

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
                document.getElementById("emailError").textContent = "Invalid email address";
                isValid = false;
            }

            if (password.length < 4) {
                document.getElementById("passwordError").textContent = "Password must be at least 4 characters";
                isValid = false;
            } else if (new TextEncoder().encode(password).length > 72) {
                document.getElementById("passwordError").textContent = "Password is too long (max 72 bytes)";
                isValid = false;
            }

            if (password !== confirmPassword) {
                document.getElementById("confirmError").textContent = "Passwords do not match";
                isValid = false;
            }

            if (!isValid) return;

            submitBtn.disabled = true;
            submitBtn.textContent = "Creating account...";

            const result = await callBackend("/api/register", { fullName, username, email, password });

            if (result) {
                if (!result.ok) {
                    document.getElementById("usernameError").textContent = errorDetail(result.data, "Registration failed");
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Sign Up";
                    return;
                }
            } else {
                // No backend: store the account in this browser
                const users = getLocalUsers();
                if (users.some(u => u.username === username)) {
                    document.getElementById("usernameError").textContent = "Username already taken";
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Sign Up";
                    return;
                }
                users.push({ fullName, username, email, password });
                localStorage.setItem("users", JSON.stringify(users));
            }

            sessionStorage.setItem("flash", `Account created! Please log in as ${username}.`);
            window.location.href = "index.html";
        });
    }

    // One-time message carried over from the sign-up page
    const flash = sessionStorage.getItem("flash");
    if (flash && loginForm) {
        sessionStorage.removeItem("flash");
        const box = document.getElementById("successMessage");
        if (box) box.textContent = flash;
        const usernameMatch = flash.match(/log in as (.+)\.$/);
        if (usernameMatch) document.getElementById("username").value = usernameMatch[1];
    }
});
