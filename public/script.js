/************************************
 * DATEN
 ************************************/
const services = [
  { id: "service-1", name: "Taper", duration: 25 },
  { id: "service-2", name: "Fade", duration: 25 },
  { id: "service-3", name: "Taper + Trim", duration: 35 },
  { id: "service-4", name: "Fade + Trim", duration: 35 },
  { id: "service-5", name: "Scissor Cut", duration: 30 }
];

const extras = [
  { id: "extras-1", name: "Bart", duration: 15 },
  { id: "extras-2", name: "Design", duration: 5 }
];

/************************************
 * VERFÜGBARKEITEN (vom Server)
 ************************************/
let availability = []; // wird beim Start per fetch() geladen


async function loadAvailability() {
  try {
    const res = await fetch("/api/availability");
    if (!res.ok) {
      throw new Error("HTTP-Status " + res.status);
    }
    availability = await res.json();
    console.log("Verfügbarkeiten geladen:", availability);
  } catch (err) {
    console.error("Fehler beim Laden der Verfügbarkeiten, nutze Fallback:", err);

    // Optionales Fallback (falls Server down o.ä.)
    availability = [
      { day: 1, label: "Montag", active: false, ranges: [{ from: "09:00", to: "18:00" }] },
      { day: 2, label: "Dienstag", active: false, ranges: [{ from: "09:00", to: "18:00" }] },
      { day: 3, label: "Mittwoch", active: false, ranges: [{ from: "09:00", to: "18:00" }] },
      { day: 4, label: "Donnerstag", active: false, ranges: [{ from: "09:00", to: "18:00" }] },
      { day: 5, label: "Freitag", active: false, ranges: [{ from: "09:00", to: "18:00" }] },
      { day: 6, label: "Samstag", active: false, ranges: [{ from: "09:00", to: "18:00" }] },
      { day: 0, label: "Sonntag", active: false, ranges: [{ from: "09:00", to: "18:00" }] }
    ];
  }
}

// Wird vom Server geladen
let bookings = [];
let dateAvailability = [];

/************************************
 * STATE
 ************************************/
let selectedDate = null;
let weekOffset = 0;
const MAX_DAYS_AHEAD = 21;
const selectedExtras = new Set();

/************************************
 * DOM-ELEMENTE
 ************************************/
const serviceSelect      = document.getElementById("service");
const extrasContainer    = document.getElementById("extras-container");
const totalDurationSpan  = document.getElementById("total-duration");
const slotsContainer     = document.getElementById("slots-container");
const weekDaysContainer  = document.getElementById("week-days");
const prevWeekBtn        = document.getElementById("prev-week");
const nextWeekBtn        = document.getElementById("next-week");
const hint               = document.getElementById("service-hint");

const nameInput          = document.getElementById("customer-name");
const phoneInput         = document.getElementById("customer-phone");
const noteInput          = document.getElementById("note");
const bookBtn            = document.getElementById("book-btn");
const selectedTimeInput  = document.getElementById("selected-time");
const logoutBtn          = document.getElementById("logout-btn");

/************************************
 * HILFSFUNKTIONEN
 ************************************/
function timeToMinutes(t) {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Wichtig: lokales Datum → verhindert „Vortag“-Bug
function dateToISO(d) {
  const year  = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day   = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function loadDateAvailability() {
  const today = new Date();
  const from = dateToISO(today);

  const future = new Date(today);
  future.setDate(today.getDate() + MAX_DAYS_AHEAD);
  const to = dateToISO(future);

  return fetch(`/api/date-availability?from=${from}&to=${to}`)
    .then(res => res.json())
    .then(data => {
      dateAvailability = Array.isArray(data) ? data : [];
      console.log("Date-Availability geladen:", dateAvailability);
    })
    .catch(err => {
      console.error("Fehler beim Laden der Tagesverfügbarkeiten:", err);
      dateAvailability = [];
    });
}


function calculateTotalDuration() {
  const service = services.find(s => s.id === serviceSelect.value);
  let total = service ? service.duration : 0;

  selectedExtras.forEach(id => {
    const ex = extras.find(e => e.id === id);
    if (ex) total += ex.duration;
  });

  totalDurationSpan.textContent = total;
  return total;
}

/************************************
 * SERVICES & EXTRAS INITIALISIEREN
 ************************************/
services.forEach(s => {
  const o = document.createElement("option");
  o.value = s.id;
  o.textContent = `${s.name} (${s.duration} Min.)`;
  serviceSelect.appendChild(o);
});

extras.forEach(extra => {
  const div = document.createElement("div");
  div.className = "extra-item";
  div.innerHTML = `${extra.name} (+${extra.duration} Min.) <span class="check">✔</span>`;

  div.addEventListener("click", () => {
    div.classList.toggle("selected");
    if (div.classList.contains("selected")) {
      selectedExtras.add(extra.id);
    } else {
      selectedExtras.delete(extra.id);
    }
    calculateTotalDuration();
    renderWeek();
    generateSlots();
  });

  extrasContainer.appendChild(div);
});

/************************************
 * VERFÜGBARKEIT EINES TAGES PRÜFEN
 ************************************/

function getTimeRangesForDate(dateObj) {
  const iso = dateToISO(dateObj);

  // 1. Override durch datumsspezifische Verfügbarkeit vom Admin
  const override = dateAvailability.find(e => e.date === iso);
  if (override) {
    if (!override.active) {
      return [];
    }

    if (!Array.isArray(override.ranges) || !override.ranges.length) {
      return [];
    }
    // ranges: [{from, to}, ...] → in Minuten
    return override.ranges.map(r => [
      timeToMinutes(r.from),
      timeToMinutes(r.to)
    ]);
  }


  // 2. Fallback: statischer Wochenplan (dein jetziges availability-Array)
  const weekday = dateObj.getDay();
  const dayAvail = availability.find(a => a.day === weekday && a.active);
  if (!dayAvail) return [];

  if (!Array.isArray(dayAvail.ranges) || !dayAvail.ranges.length) {
    return [];
  }
  return dayAvail.ranges.map(r => [
    timeToMinutes(r.from),
    timeToMinutes(r.to)
  ]);
}

function isDayAvailable(dateObj) {
  if (!serviceSelect.value) return false;

  const total = calculateTotalDuration();
  const iso   = dateToISO(dateObj);

  const ranges = getTimeRangesForDate(dateObj); // ⬅️ NEU
  if (!ranges.length) return false;

  const dayBookings = bookings.filter(b => b.date === iso);
  const bookedRanges = dayBookings.map(b => [
    timeToMinutes(b.startTime),
    timeToMinutes(b.endTime)
  ]);

  // Prüfe über ALLE Zeitfenster (z.B. 09–12 & 14–18)
  for (const [dayStart, dayEnd] of ranges) {
    for (let t = dayStart; t + total <= dayEnd; t += 15) {
      const overlaps = bookedRanges.some(([s, e]) => t < e && t + total > s);
      if (!overlaps) return true;
    }
  }

  return false;
}

/************************************
 * WOCHENKALENDER RENDERN
 ************************************/
function renderWeek() {
  weekDaysContainer.innerHTML = "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + weekOffset + i);

    const diff = (d - today) / 86400000;
    if (diff < 0 || diff > MAX_DAYS_AHEAD) continue;

    const iso = dateToISO(d);
    const serviceChosen = !!serviceSelect.value;

    let state = "disabled";
    if (serviceChosen) {
      state = isDayAvailable(d) ? "available" : "unavailable";
    }

    const circle = document.createElement("div");
    circle.className = `day-circle ${state}`;
    if (iso === selectedDate) circle.classList.add("active");

    const weekdayStr = d.toLocaleDateString("de-DE", { weekday: "short" });
    const dateStr    = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;

    circle.innerHTML = `<strong>${weekdayStr}</strong><br><span>${dateStr}</span>`;

    if (state === "available") {
      circle.addEventListener("click", () => {
        selectedDate = iso;
        selectedTimeInput.value = "";
        slotsContainer.innerHTML = "";
        renderWeek();
        generateSlots();
      });
    }

    weekDaysContainer.appendChild(circle);
  }

  prevWeekBtn.disabled = weekOffset === 0;
  nextWeekBtn.disabled = weekOffset + 7 > MAX_DAYS_AHEAD;
}

/************************************
 * ZEITSLOTS RENDERN (GRAU / GRÜN / ROT)
 ************************************/
function generateSlots() {
  slotsContainer.innerHTML = "";
  if (!selectedDate || !serviceSelect.value) return;

  const total = calculateTotalDuration();
  const dateObj = parseISODate(selectedDate);

  const ranges = getTimeRangesForDate(dateObj);
  if (!ranges.length) return;

  const dayBookings = bookings.filter(b => b.date === selectedDate);

  // Buchungen als Minutenbereiche
  const bookedRanges = dayBookings
    .filter(b => b.startTime && b.endTime)
    .map(b => [timeToMinutes(b.startTime), timeToMinutes(b.endTime)])
    .sort((a, b) => a[0] - b[0]);

  // Helper: overlap check
  const overlapsAny = (t) => bookedRanges.some(([s, e]) => t < e && t + total > s);

  // Helper: passt komplett in irgendeine Range?
  const fitsInAnyRange = (t) =>
    ranges.some(([rs, re]) => t >= rs && t + total <= re);

  // 1) Anker-Logik:
  // - Basisanker = Range-Start (auf 15 gerundet).
  // - Zusätzliche Anker = Endzeiten von Buchungen in dieser Range.
  // - Bei der Slot-Erzeugung gilt: immer der letzte Anker <= Slot-Zeit,
  //   damit alle Folge-Slots im 15-Min-Takt ab der letzten Buchung laufen.

  const anchors = []; // { t: number, rs: number, re: number, bookingEnds: number[] }
  for (const [rs, re] of ranges) {
    const bookingEnds = bookedRanges
      .filter(([_, be]) => be >= rs && be <= re)
      .map(([_, be]) => be)
      .sort((a, b) => a - b);

      const base = rs;
    if (base + total <= re) anchors.push({ t: base, rs, re, bookingEnds });
    bookingEnds.forEach(be => {
      anchors.push({ t: be, rs, re, bookingEnds });
    });
    }
  }
  
  // Dedupe Anker (gleicher Start in gleicher Range)
  const anchorKey = (a) => `${a.rs}-${a.re}-${a.t}`;
  const uniqueAnchors = Array.from(new Map(anchors.map(a => [anchorKey(a), a])).values());

  // ------------------------------
  // 3) Aus allen Ankern Sequenzen generieren (15-Min-Schritte ab Anker)
  // ------------------------------
  const candidates = new Set();
  const bookedSlots = new Set();

  for (const [start, end] of bookedRanges) {
    for (let t = start; t < end; t += 15) {
      bookedSlots.add(t);
    }
  }

  const latestAnchorForTime = (bookingEnds, base, t) => {
    const ends = bookingEnds.filter(be => be <= t);
    if (!ends.length) return base;
    return ends[ends.length - 1];
  };

  for (const a of uniqueAnchors) {
    for (let t = a.t; t + total <= a.re; t += 15) {
      // Nur Zeiten, die wirklich in einer Range liegen
      if (!fitsInAnyRange(t)) continue;

      const base = a.rs;
      const expectedAnchor = latestAnchorForTime(a.bookingEnds, base, t);
      if (expectedAnchor !== a.t) continue;

      // Keine Überschneidungen anbieten
      if (!overlapsAny(t)) {
        candidates.add(t);
      }
  }
}

  // Sortieren
  const times = Array.from(new Set([...candidates, ...bookedSlots])).sort((x, y) => x - y);

  // Render
  for (const t of times) {
    const btn = document.createElement("button");
    btn.textContent = minutesToTime(t);
    const isBooked = bookedSlots.has(t);
    btn.classList.add("slot", isBooked ? "booked" : "available");
    if (isBooked) {
      btn.disabled = true;
    }

    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      selectedTimeInput.value = btn.textContent;
      Array.from(slotsContainer.children).forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
    });

    slotsContainer.appendChild(btn);
  }

/************************************
 * NAVIGATION VOR/ZURÜCK
 ************************************/
prevWeekBtn.addEventListener("click", () => {
  if (weekOffset === 0) return;
  weekOffset -= 7;
  renderWeek();
  generateSlots();
});

nextWeekBtn.addEventListener("click", () => {
  if (weekOffset + 7 > MAX_DAYS_AHEAD) return;
  weekOffset += 7;
  renderWeek();
  generateSlots();
});

/************************************
 * SERVICE-ÄNDERUNG
 ************************************/
serviceSelect.addEventListener("change", () => {
  calculateTotalDuration();

  if (!serviceSelect.value) {
    selectedDate = null;
    selectedTimeInput.value = "";
    slotsContainer.innerHTML = "";
    if (hint) hint.style.display = "block";
  } else {
    if (hint) hint.style.display = "none";
  }

  renderWeek();
  generateSlots();
});

/************************************
 * TERMIN BUCHEN
 ************************************/
bookBtn.addEventListener("click", () => {
  const date = selectedDate;
  const time = selectedTimeInput.value;
  const serviceId = serviceSelect.value;
  const note = noteInput.value;

  if (!date || !time || !serviceId) {
    alert("Bitte Datum, Service und Uhrzeit auswählen.");
    return;
  }

  if (!nameInput.value.trim()) {
    alert("Bitte Namen eingeben.");
    return;
  }

  if (!phoneInput.value.trim()) {
    alert("Bitte Telefonnummer eingeben.");
    return;
  }

  const bookingData = {
    date,
    time,
    serviceId,
    extras: Array.from(selectedExtras),
    note,
    customer: {
      name: nameInput.value.trim(),
      phone: phoneInput.value.trim()
    }
  };

  fetch("/api/bookings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(bookingData)
  })
    .then(async res => {
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.error || "Es gab ein Problem beim Speichern der Buchung.");
        return;
      }

      localStorage.setItem("lastBooking", JSON.stringify(data.booking));
      window.location.href = "confirmation.html";
    })
    .catch(err => {
      console.error(err);
      alert("Es gab ein technisches Problem. Bitte später erneut versuchen.");
    });
});

/************************************
 * INITIALISIERUNG
 ************************************/
document.addEventListener("DOMContentLoaded", () => {
  if (hint) hint.style.display = "block";
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      sessionStorage.removeItem("accessGranted");
      sessionStorage.removeItem("adminAccess");
      window.location.href = "login.html";
    });
  }

  Promise.all([
    loadAvailability(), 
    loadDateAvailability(), // ⬅️ erst Admin-Verfügbarkeiten holen
    fetch("/api/bookings")
      .then(res => res.json())
      .catch(err => {
        console.error("Fehler beim Laden der Buchungen:", err);
        return [];
      })
   ]).then(([, , data]) => {
    bookings = data;
    renderWeek();
    generateSlots();
  });
});
