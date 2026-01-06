// ================================
// Konfiguration
// ================================
const MAX_ATTEMPTS = 3;
const LOCK_TIME = 30 * 60 * 1000; // 30 Minuten

let ACCESS_CODE = "";
let ADMIN_CODE = "";

// ================================
// DOM-Elemente
// ================================
const input = document.getElementById("code-input");
const btn = document.getElementById("login-btn");
const error = document.getElementById("error");

// Button erst aktivieren, wenn Code geladen ist
btn.disabled = true;

// ================================
// Zugriffscode laden
// ================================
fetch("config.json")
  .then(res => res.json())
  .then(config => {
    ACCESS_CODE = String(config.accessCode);
    ADMIN_CODE  = String(config.adminCode);
    btn.disabled = false;
  })
  .catch(() => {
    error.textContent = "Zugangscode konnte nicht geladen werden.";
    error.style.display = "block";
  });

// ================================
// Sperrstatus beim Laden prüfen
// ================================
const lockUntil = localStorage.getItem("lockUntil");

if (lockUntil && Date.now() < Number(lockUntil)) {
  input.disabled = true;
  btn.disabled = true;

  const minutesLeft = Math.ceil((lockUntil - Date.now()) / 60000);
  error.textContent = `Zu viele Versuche. Bitte in ${minutesLeft} Min erneut versuchen.`;
  error.style.display = "block";
}

// ================================
// Login-Logik
// ================================
btn.onclick = () => {
  const now = Date.now();
  const lockUntil = localStorage.getItem("lockUntil");

  // Falls noch gesperrt
  if (lockUntil && now < Number(lockUntil)) return;

  const enteredCode = input.value.trim();

  // Richtiger Kunden-Code
if (enteredCode === ACCESS_CODE) {
  localStorage.removeItem("failedAttempts");
  localStorage.removeItem("lockUntil");
  sessionStorage.setItem("accessGranted", "true");
  window.location.href = "index.html";
  return;
}

// Richtiger Admin-Code
if (enteredCode === ADMIN_CODE) {
  localStorage.removeItem("failedAttempts");
  localStorage.removeItem("lockUntil");
  sessionStorage.setItem("adminAccess", "true");
  window.location.href = "admin.html";
  return;
}

  
  // Falscher Code
  let attempts = Number(localStorage.getItem("failedAttempts")) || 0;
  attempts++;

  if (attempts >= MAX_ATTEMPTS) {
    localStorage.setItem("lockUntil", now + LOCK_TIME);
    localStorage.removeItem("failedAttempts");

    input.disabled = true;
    btn.disabled = true;

    error.textContent = "Zu viele Versuche. Bitte in 30 Minuten erneut versuchen.";
    error.style.display = "block";
  } else {
    localStorage.setItem("failedAttempts", attempts);
    error.textContent = `Falscher Code (${attempts}/${MAX_ATTEMPTS})`;
    error.style.display = "block";
  }
};
