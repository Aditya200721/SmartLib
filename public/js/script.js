"use strict";

/* =========================================================
   DOM ELEMENTS
========================================================= */

const rootElement = document.documentElement;

const themeToggle = document.getElementById("themeToggle");
const themeSelect = document.getElementById("themeSelect");

const menuBtn = document.getElementById("menuBtn");
const navLinks = document.getElementById("navLinks");

const authModal = document.getElementById("authModal");
const loginBtn = document.getElementById("loginBtn");
const adminLoginBtn = document.getElementById("adminLoginBtn");
const getStartedBtn = document.getElementById("getStartedBtn");
const heroGetStartedBtn = document.getElementById("heroGetStartedBtn");
const closeAuthBtn = document.getElementById("closeAuthBtn");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");
const authMessage = document.getElementById("authMessage");

const authTabs = document.getElementById("authTabs");
const registerTab = document.getElementById("registerTab");
const loginRegisterSwitch = document.getElementById("loginRegisterSwitch");
const loginSubmitBtn = document.getElementById("loginSubmitBtn");

const currentYear = document.getElementById("currentYear");

let previousFocusedElement = null;
let selectedLoginRole = "student";


/* =========================================================
   THEME MANAGEMENT
========================================================= */

const THEME_STORAGE_KEY = "smartlib-theme";
const DARK_STYLE_STORAGE_KEY = "smartlib-dark-style";

const validThemes = ["ocean", "emerald", "dark"];

let preferredDarkTheme = "dark";

function getSavedTheme() {
    try {
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);

        if (savedTheme === "light") {
            return "ocean";
        }

        if (validThemes.includes(savedTheme)) {
            return savedTheme;
        }
    } catch (error) {
        console.warn("Unable to read saved theme:", error);
    }

    return "ocean";
}

function getSavedDarkTheme() {
    try {
        const savedDarkTheme = localStorage.getItem(DARK_STYLE_STORAGE_KEY);

        if (savedDarkTheme === "emerald" || savedDarkTheme === "dark") {
            return savedDarkTheme;
        }
    } catch (error) {
        console.warn("Unable to read saved dark theme:", error);
    }

    return "dark";
}

function updateThemeButton(theme) {
    if (!themeToggle) return;

    const icon = themeToggle.querySelector("i");
    const isOcean = theme === "ocean";

    if (icon) {
        icon.className = isOcean
            ? "fa-solid fa-moon"
            : "fa-solid fa-sun";
    }

    const label = isOcean
        ? "Switch to dark mode"
        : "Switch to Ocean Light mode";

    themeToggle.setAttribute("aria-label", label);
    themeToggle.setAttribute("title", label);
}

function applyTheme(theme, save = true) {
    if (!validThemes.includes(theme)) {
        theme = "ocean";
    }

    rootElement.setAttribute("data-theme", theme);

    if (themeSelect) {
        themeSelect.value = theme;
    }

    updateThemeButton(theme);

    const themeColors = {
        ocean: "#ffffff",
        emerald: "#07110b",
        dark: "#000000"
    };

    const themeColorMeta = document.querySelector(
        'meta[name="theme-color"]'
    );

    if (themeColorMeta) {
        themeColorMeta.setAttribute("content", themeColors[theme]);
    }

    if (theme !== "ocean") {
        preferredDarkTheme = theme;

        try {
            localStorage.setItem(DARK_STYLE_STORAGE_KEY, theme);
        } catch (error) {
            console.warn("Unable to save dark theme:", error);
        }
    }

    if (save) {
        try {
            localStorage.setItem(THEME_STORAGE_KEY, theme);
        } catch (error) {
            console.warn("Unable to save theme:", error);
        }
    }
}

preferredDarkTheme = getSavedDarkTheme();
applyTheme(getSavedTheme(), false);

if (themeSelect) {
    themeSelect.addEventListener("change", () => {
        const selectedTheme = themeSelect.value;

        if (validThemes.includes(selectedTheme)) {
            applyTheme(selectedTheme);
        }
    });
}

if (themeToggle) {
    themeToggle.addEventListener("click", () => {
        const currentTheme = rootElement.getAttribute("data-theme");

        if (currentTheme === "ocean") {
            applyTheme(preferredDarkTheme);
        } else {
            applyTheme("ocean");
        }
    });
}


/* =========================================================
   MOBILE NAVIGATION
========================================================= */

function closeMobileMenu() {
    if (!menuBtn || !navLinks) return;

    navLinks.classList.remove("open");

    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.setAttribute("aria-label", "Open menu");

    const icon = menuBtn.querySelector("i");

    if (icon) {
        icon.className = "fa-solid fa-bars";
    }
}

if (menuBtn && navLinks) {
    menuBtn.addEventListener("click", () => {
        const isOpen = navLinks.classList.toggle("open");

        menuBtn.setAttribute("aria-expanded", String(isOpen));
        menuBtn.setAttribute(
            "aria-label",
            isOpen ? "Close menu" : "Open menu"
        );

        const icon = menuBtn.querySelector("i");

        if (icon) {
            icon.className = isOpen
                ? "fa-solid fa-xmark"
                : "fa-solid fa-bars";
        }
    });

    navLinks.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", closeMobileMenu);
    });

    document.addEventListener("click", event => {
        const clickedInsideMenu = navLinks.contains(event.target);
        const clickedMenuButton = menuBtn.contains(event.target);

        if (!clickedInsideMenu && !clickedMenuButton) {
            closeMobileMenu();
        }
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 800) {
            closeMobileMenu();
        }
    });
}


/* =========================================================
   ACTIVE NAVIGATION LINK
========================================================= */

const navigationLinks = document.querySelectorAll(
    '.nav-links a[href^="#"]'
);

const navigationSections = document.querySelectorAll(
    "main section[id]"
);

function updateActiveNavigation() {
    if (!navigationSections.length || !navigationLinks.length) {
        return;
    }

    let currentSection = "home";

    navigationSections.forEach(section => {
        const sectionTop = section.offsetTop - 150;

        if (window.scrollY >= sectionTop) {
            currentSection = section.id;
        }
    });

    navigationLinks.forEach(link => {
        const isActive =
            link.getAttribute("href") === `#${currentSection}`;

        link.classList.toggle("active", isActive);
    });
}

window.addEventListener("scroll", updateActiveNavigation, {
    passive: true
});

updateActiveNavigation();


/* =========================================================
   FOOTER YEAR
========================================================= */

if (currentYear) {
    currentYear.textContent = new Date().getFullYear();
}


/* =========================================================
   AUTHENTICATION MESSAGES
========================================================= */

function showAuthMessage(message, type = "") {
    if (!authMessage) return;

    authMessage.textContent = message;
    authMessage.className = "auth-message";

    if (type) {
        authMessage.classList.add(type);
    }
}

function clearAuthMessage() {
    showAuthMessage("");
}


/* =========================================================
   LOGIN ROLE AND AUTH MODAL
========================================================= */

function setLoginRole(role) {
    selectedLoginRole = role === "admin" ? "admin" : "student";

    const isAdmin = selectedLoginRole === "admin";

    /*
     * Keep the tab container visible in both modes.
     * Admin mode uses one full-width column.
     * Student mode uses the original two-column layout.
     */
    if (authTabs) {
        authTabs.hidden = false;
        authTabs.style.gridTemplateColumns = isAdmin ? "1fr" : "";
    }

    // Hide only the registration tab in admin mode.
    if (registerTab) {
        registerTab.hidden = isAdmin;
    }

    if (loginRegisterSwitch) {
        loginRegisterSwitch.hidden = isAdmin;
    }

    if (authTitle) {
        authTitle.textContent = isAdmin
            ? "Administrator Login"
            : "Welcome Back";
    }

    if (authSubtitle) {
        authSubtitle.textContent = isAdmin
            ? "Log in to manage your library."
            : "Log in to continue to your library.";
    }

    if (loginSubmitBtn) {
        loginSubmitBtn.innerHTML = isAdmin
            ? 'Admin Login <i class="fa-solid fa-arrow-right"></i>'
            : 'Login <i class="fa-solid fa-arrow-right"></i>';
    }

    clearAuthMessage();
}

function setAuthMode(mode) {
    // Public registration is only available in student mode.
    if (mode === "register" && selectedLoginRole === "admin") {
        return;
    }

    const isLogin = mode === "login";

    if (loginForm) {
        loginForm.hidden = !isLogin;
    }

    if (registerForm) {
        registerForm.hidden = isLogin;
    }

    document.querySelectorAll("[data-auth-tab]").forEach(tab => {
        const isActive = tab.dataset.authTab === mode;

        tab.classList.toggle("active", isActive);
        tab.setAttribute("aria-selected", String(isActive));
    });

    if (isLogin) {
        setLoginRole(selectedLoginRole);
    } else {
        if (authTitle) {
            authTitle.textContent = "Create Your Account";
        }

        if (authSubtitle) {
            authSubtitle.textContent =
                "Join Smart Lib and explore your library.";
        }

        clearAuthMessage();
    }
}

function openAuth(mode = "login", role = "student") {
    if (!authModal) return;

    previousFocusedElement = document.activeElement;

    setLoginRole(role);

    // Registration always belongs to the student flow.
    if (mode === "register") {
        selectedLoginRole = "student";
        setLoginRole("student");
    }

    setAuthMode(mode);

    authModal.classList.add("open");
    authModal.setAttribute("aria-hidden", "false");

    document.body.style.overflow = "hidden";

    const firstInput = mode === "register"
        ? document.getElementById("registerName")
        : document.getElementById("loginEmail");

    if (firstInput) {
        setTimeout(() => firstInput.focus(), 50);
    }
}

function closeAuth() {
    if (!authModal) return;

    authModal.classList.remove("open");
    authModal.setAttribute("aria-hidden", "true");

    document.body.style.overflow = "";

    clearAuthMessage();

    if (
        previousFocusedElement &&
        typeof previousFocusedElement.focus === "function"
    ) {
        previousFocusedElement.focus();
    }
}


/* =========================================================
   AUTH BUTTON EVENTS
========================================================= */

// Normal Login: opens student login.
if (loginBtn) {
    loginBtn.addEventListener("click", event => {
        event.preventDefault();
        openAuth("login", "student");
    });
}

// Admin Login: opens admin-only login.
if (adminLoginBtn) {
    adminLoginBtn.addEventListener("click", event => {
        event.preventDefault();
        openAuth("login", "admin");
    });
}

// Header Get Started: opens student registration.
if (getStartedBtn) {
    getStartedBtn.addEventListener("click", event => {
        event.preventDefault();
        openAuth("register", "student");
    });
}

// Hero Get Started: opens student registration.
if (heroGetStartedBtn) {
    heroGetStartedBtn.addEventListener("click", event => {
        event.preventDefault();
        openAuth("register", "student");
    });
}

if (closeAuthBtn) {
    closeAuthBtn.addEventListener("click", closeAuth);
}

document.querySelectorAll("[data-close-auth]").forEach(element => {
    element.addEventListener("click", closeAuth);
});

document.querySelectorAll("[data-auth-tab]").forEach(tab => {
    tab.addEventListener("click", () => {
        const requestedMode = tab.dataset.authTab;

        if (requestedMode === "register" && selectedLoginRole === "admin") {
            return;
        }

        setAuthMode(requestedMode);
    });
});

document.querySelectorAll("[data-switch-auth]").forEach(button => {
    button.addEventListener("click", () => {
        const requestedMode = button.dataset.switchAuth;

        if (requestedMode === "register" && selectedLoginRole === "admin") {
            return;
        }

        setAuthMode(requestedMode);
    });
});

document.addEventListener("keydown", event => {
    if (
        event.key === "Escape" &&
        authModal?.classList.contains("open")
    ) {
        closeAuth();
    }
});


/* =========================================================
   PASSWORD VISIBILITY
========================================================= */

document.querySelectorAll("[data-toggle-password]").forEach(button => {
    button.addEventListener("click", () => {
        const inputId = button.dataset.togglePassword;
        const passwordInput = document.getElementById(inputId);

        if (!passwordInput) return;

        const isPassword = passwordInput.type === "password";

        passwordInput.type = isPassword ? "text" : "password";

        button.setAttribute(
            "aria-label",
            isPassword ? "Hide password" : "Show password"
        );

        const icon = button.querySelector("i");

        if (icon) {
            icon.className = isPassword
                ? "fa-regular fa-eye-slash"
                : "fa-regular fa-eye";
        }
    });
});


/* =========================================================
   API HELPER
========================================================= */

async function sendApiRequest(url, options = {}) {
    const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options.headers
        }
    });

    let result;

    try {
        result = await response.json();
    } catch {
        throw new Error("The server returned an invalid response.");
    }

    if (!response.ok) {
        throw new Error(
            result.message ||
            result.error ||
            "Something went wrong. Please try again."
        );
    }

    return result;
}

function setFormLoading(form, loading, loadingText = "Please wait...") {
    if (!form) return;

    const submitButton = form.querySelector('button[type="submit"]');

    if (!submitButton) return;

    if (loading) {
        submitButton.dataset.originalText = submitButton.innerHTML;
        submitButton.disabled = true;
        submitButton.textContent = loadingText;
    } else {
        submitButton.disabled = false;

        if (submitButton.dataset.originalText) {
            submitButton.innerHTML = submitButton.dataset.originalText;
            delete submitButton.dataset.originalText;
        }
    }
}


/* =========================================================
   STUDENT REGISTRATION
========================================================= */

if (registerForm) {
    registerForm.addEventListener("submit", async event => {
        event.preventDefault();
        clearAuthMessage();

        if (selectedLoginRole !== "student") {
            showAuthMessage(
                "Admin accounts cannot be created through public registration.",
                "error"
            );
            return;
        }

        const name = document.getElementById("registerName")?.value.trim();
        const email = document.getElementById("registerEmail")?.value.trim();
        const password = document.getElementById("registerPassword")?.value;
        const confirmPassword = document.getElementById("confirmPassword")?.value;

        if (!name || !email || !password || !confirmPassword) {
            showAuthMessage("Please fill in all fields.", "error");
            return;
        }

        if (password.length < 8) {
            showAuthMessage(
                "Password must contain at least 8 characters.",
                "error"
            );
            return;
        }

        if (password !== confirmPassword) {
            showAuthMessage("Passwords do not match.", "error");
            return;
        }

        setFormLoading(registerForm, true, "Creating account...");

        try {
           const result = await sendApiRequest(
    "/api/auth/register",
    {
        method: "POST",
        body: JSON.stringify({
            name,
            email,
            password
        })
    }
);

if (!result.user || result.user.role !== "student") {
    throw new Error(
        "Account created, but automatic login could not be confirmed."
    );
}

window.location.href = "/student-portal.html";
return;
            /*
             * Registration creates the account but does not authenticate
             * the user. Keep the user on the landing page and switch
             * to the login form.
             */

            registerForm.reset();

            const loginEmailInput = document.getElementById("loginEmail");

            if (loginEmailInput) {
                loginEmailInput.value = email;
            }

            setAuthMode("login");

            showAuthMessage(
                "Account created successfully. Please log in with your new credentials.",
                "success"
            );

        } catch (error) {
            showAuthMessage(error.message, "error");
        } finally {
            setFormLoading(registerForm, false);
        }
    });
}


/* =========================================================
   LOGIN — STUDENT AND ADMIN
========================================================= */

if (loginForm) {
    loginForm.addEventListener("submit", async event => {
        event.preventDefault();
        clearAuthMessage();

        const email = document.getElementById("loginEmail")?.value.trim();
        const password = document.getElementById("loginPassword")?.value;

        if (!email || !password) {
            showAuthMessage(
                "Please enter your email and password.",
                "error"
            );
            return;
        }

        const requestedRole = selectedLoginRole;

        setFormLoading(loginForm, true, "Logging in...");

        try {
            const result = await sendApiRequest(
                "/api/auth/login",
                {
                    method: "POST",
                    body: JSON.stringify({
                        email,
                        password,
                        role: requestedRole
                    })
                }
            );

            const user = result.user;

            if (!user) {
                throw new Error(
                    "Login succeeded, but user information was not returned."
                );
            }

            if (user.role !== requestedRole) {
                throw new Error(
                    "This account does not have the selected login role."
                );
            }

            showAuthMessage(
                result.message || "Login successful. Redirecting...",
                "success"
            );

            if (user.role === "student") {
                window.location.href = "/student-portal.html";
            } else if (user.role === "admin") {
                window.location.href = "/admin-dashboard.html";
            } else {
                showAuthMessage(
                    "Your account role is not supported.",
                    "error"
                );
            }

        } catch (error) {
            showAuthMessage(error.message, "error");
        } finally {
            setFormLoading(loginForm, false);
        }
    });
}