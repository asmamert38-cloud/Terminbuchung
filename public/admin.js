// ================================
// DOM-Elemente
// ================================
const container = document.getElementById("admin-bookings");
const backBtn = document.getElementById("back-btn");
const adminLogoutBtn = document.getElementById("admin-logout-btn");

const availabilityContainer = document.getElementById("availability-container");
const saveAvailabilityBtn = document.getElementById("save-availability-btn");
const availabilityMessage = document.getElementById("availability-message");

const availPrevWeekBtn = document.getElementById("avail-prev-week");
const availNextWeekBtn = document.getElementById("avail-next-week");
const availWeekLabel = document.getElementById("avail-week-label");

// ================================
// Helper
// ================================
function timeToMinutes(t) {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
}

function toISODate(date) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeekMonday(baseDate) {
  const d = new Date(baseDate);
  const day = d.getDay(); // 0 = So, 1 = Mo, ...
  const diff = day === 0 ? -6 : 1 - day; // auf Montag zurück
  return addDays(d, diff);
}

const weekdayOrder = [1, 2, 3, 4, 5, 6, 0]; // Mo–Sa, So
const weekdayNames = {
  1: "Montag",
  2: "Dienstag",
  3: "Mittwoch",
  4: "Donnerstag",
  5: "Freitag",
  6: "Samstag",
  0: "Sonntag"
};

// Gleiche Definition wie im Server – wichtig, dass IDs übereinstimmen
const services = [
    { id: "service-1", name: "Taper" },
    { id: "service-2", name: "Fade" },
    { id: "service-3", name: "Taper + Trim" },
    { id: "service-4", name: "Fade + Trim" },
    { id: "service-5", name: "Scissor Cut" }
  ];
  
  const extrasList = [
    { id: "extras-1", name: "Bart" },
    { id: "extras-2", name: "Design" }
  ];
  
  function getServiceName(id) {
    const s = services.find(s => s.id === id);
    return s ? s.name : id;
  }
  
  function getExtrasNames(extraIds) {
    if (!Array.isArray(extraIds) || !extraIds.length) return "Keine";
    return extraIds
      .map(id => {
        const ex = extrasList.find(e => e.id === id);
        return ex ? ex.name : id;
      })
      .join(", ");
  }
  

// ================================
// State für Wochen-Navigation
// ================================
const today = new Date();
const minWeekStart = startOfWeekMonday(today);
const maxWeekStart = startOfWeekMonday(addDays(today, 14)); // 3 Wochen = aktuelle + 2 weitere

let currentWeekStart = startOfWeekMonday(today);
let dateAvailability = []; // { date, active, ranges }

// ================================
// Buchungen laden (Admin-Übersicht)
// ================================
fetch("/api/bookings")
  .then(res => res.json())
  .then(data => {
    if (!data.length) {
      container.textContent = "Noch keine Buchungen vorhanden.";
      return;
    }

    // nach Datum + Uhrzeit sortieren
    data.sort((a, b) => {
      if (a.date === b.date) {
        return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
      }
      return a.date.localeCompare(b.date);
    });

    const list = document.createElement("div");
    let currentDate = null;

    data.forEach(b => {
      if (b.date !== currentDate) {
        currentDate = b.date;
        const dateHeader = document.createElement("h3");
        const d = new Date(b.date);
        dateHeader.textContent = d.toLocaleDateString("de-DE", {
          weekday: "long",
          day: "2-digit",
          month: "2-digit",
          year: "numeric"
        });
        list.appendChild(dateHeader);
      }

      const card = document.createElement("div");
      card.style.padding = "10px 12px";
      card.style.marginBottom = "8px";
      card.style.borderRadius = "8px";
      card.style.background = "#f7f7f7";

      const serviceName = getServiceName(b.serviceId);
      const extrasNames = getExtrasNames(b.extras);

      card.innerHTML = `
      <p><strong>${b.startTime}–${b.endTime} Uhr</strong></p>
      <p><strong>Name:</strong> ${b.customer?.name || "-"}</p>
      <p><strong>Telefon:</strong> ${b.customer?.phone || "-"}</p>
      <p><strong>Service:</strong> ${serviceName}</p>
      <p><strong>Extras:</strong> ${extrasNames}</p>
      <p><strong>Notiz:</strong> ${b.note || "Keine"}</p>
    `;
    
      list.appendChild(card);
    });

    container.innerHTML = "";
    container.appendChild(list);
  })
  .catch(err => {
    console.error(err);
    container.textContent = "Fehler beim Laden der Buchungen.";
  });

// ================================
// Datumsspezifische Verfügbarkeiten laden
// ================================
function loadDateAvailabilityForRange() {
  const from = toISODate(today);
  const to = toISODate(addDays(today, 20)); // heute + 20 Tage ≈ 3 Wochen

  return fetch(`/api/date-availability?from=${from}&to=${to}`)
    .then(res => res.json())
    .then(data => {
      dateAvailability = Array.isArray(data) ? data : [];
    })
    .catch(err => {
      console.error("Fehler beim Laden der Datumsspezifischen Verfügbarkeiten:", err);
      dateAvailability = [];
    });
}

function getDateAvailability(isoDate) {
  return dateAvailability.find(e => e.date === isoDate) || null;
}

// ================================
// UI: Karten (Montag–Sonntag) für aktuelle Woche
// ================================
function addRangeRow(parent, from = "09:00", to = "18:00") {
  const row = document.createElement("div");
  row.className = "range-row";

  row.innerHTML = `
    <span class="range-label">von</span>
    <input type="time" class="range-from" value="${from}">
    <span class="range-label">bis</span>
    <input type="time" class="range-to" value="${to}">
    <button type="button" class="remove-range" title="Zeitraum entfernen">✖</button>
  `;

  row.querySelector(".remove-range").onclick = () => row.remove();

  parent.appendChild(row);
}

function renderWeekLabel() {
  const start = currentWeekStart;
  const end = addDays(currentWeekStart, 6);

  const startStr = start.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit"
  });
  const endStr = end.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit"
  });

  availWeekLabel.textContent = `${startStr} – ${endStr}`;

  // Pfeile aktiv/deaktiv
  if (currentWeekStart <= minWeekStart) {
    availPrevWeekBtn.disabled = true;
  } else {
    availPrevWeekBtn.disabled = false;
  }

  if (currentWeekStart >= maxWeekStart) {
    availNextWeekBtn.disabled = true;
  } else {
    availNextWeekBtn.disabled = false;
  }
}

function renderAvailabilityCards() {
  if (!availabilityContainer) return;

  renderWeekLabel();

  const wrapper = document.createElement("div");
  wrapper.className = "day-grid";

  weekdayOrder.forEach((day, idx) => {
    const dateObj = addDays(currentWeekStart, idx);
    const iso = toISODate(dateObj);

    const existing = getDateAvailability(iso);

    const active = existing ? existing.active : false;
    const ranges = existing && Array.isArray(existing.ranges) && existing.ranges.length
      ? existing.ranges
      : [{ from: "09:00", to: "18:00" }];

      const card = document.createElement("div");
      card.className = "day-card availability-row";
      card.dataset.date = iso;
      
      if (active) {
        card.classList.add("active-day");
      } else {
        card.classList.add("inactive-day");
      }
      
    const header = document.createElement("div");
    header.className = "day-header";
    header.innerHTML = `
      <div class="day-title">
        <span>${weekdayNames[day]}</span>
        <span class="day-date-label">
          ${dateObj.toLocaleDateString("de-DE", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
          })}
        </span>
      </div>
      <label class="day-active">
        <input type="checkbox" class="avail-active" ${active ? "checked" : ""}>
        <span>aktiv</span>
      </label>
    `;

    const checkbox = header.querySelector(".avail-active");
checkbox.addEventListener("change", () => {
  card.classList.toggle("active-day", checkbox.checked);
  card.classList.toggle("inactive-day", !checkbox.checked);
});
    const rangesDiv = document.createElement("div");
    rangesDiv.className = "day-ranges ranges";

    ranges.forEach(r => addRangeRow(rangesDiv, r.from, r.to));

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "add-range-btn";
    addBtn.textContent = "+ Zeitraum hinzufügen";
    addBtn.onclick = () => addRangeRow(rangesDiv);

    card.appendChild(header);
    card.appendChild(rangesDiv);
    card.appendChild(addBtn);

    wrapper.appendChild(card);
  });

  availabilityContainer.innerHTML = "";
  availabilityContainer.appendChild(wrapper);
}

// ================================
// Verfügbarkeiten dieser Woche speichern
// ================================
if (saveAvailabilityBtn) {
  saveAvailabilityBtn.addEventListener("click", () => {
    const rows = availabilityContainer.querySelectorAll(".availability-row");
    const payload = [];

    rows.forEach(row => {
      const isoDate = row.dataset.date;
      const active = row.querySelector(".avail-active").checked;

      const ranges = [];
      row.querySelectorAll(".range-row").forEach(r => {
        const fromInput = r.querySelector(".range-from");
        const toInput = r.querySelector(".range-to");
        if (!fromInput || !toInput) return;

        const from = fromInput.value || "09:00";
        const to = toInput.value || "18:00";

        ranges.push({ from, to });
      });

      payload.push({
        date: isoDate,
        active,
        ranges
      });
    });

    // alle 7 Tage per /api/date-availability speichern
    const requests = payload.map(entry =>
      fetch("/api/date-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry)
      }).then(res => res.json())
    );

    Promise.all(requests)
      .then(results => {
        const allOk = results.every(r => r && r.success);
        if (!allOk) {
          throw new Error("Mindestens ein Tag konnte nicht gespeichert werden.");
        }

        // lokalen State aktualisieren
        results.forEach(r => {
          if (!r || !r.entry) return;
          const idx = dateAvailability.findIndex(e => e.date === r.entry.date);
          if (idx >= 0) {
            dateAvailability[idx] = r.entry;
          } else {
            dateAvailability.push(r.entry);
          }
        });

        availabilityMessage.style.display = "block";
        availabilityMessage.style.color = "#0a7d2c";
        availabilityMessage.textContent = "Verfügbarkeiten für diese Woche wurden gespeichert.";
        setTimeout(() => {
          availabilityMessage.style.display = "none";
        }, 3000);
      })
      .catch(err => {
        console.error(err);
        availabilityMessage.style.display = "block";
        availabilityMessage.style.color = "#b00020";
        availabilityMessage.textContent = "Fehler beim Speichern der Verfügbarkeiten.";
      });
  });
}

// ================================
// Wochen-Navigation + Init
// ================================
if (availPrevWeekBtn && availNextWeekBtn) {
  availPrevWeekBtn.addEventListener("click", () => {
    const newStart = addDays(currentWeekStart, -7);
    if (newStart < minWeekStart) return;
    currentWeekStart = newStart;
    renderAvailabilityCards();
  });

  availNextWeekBtn.addEventListener("click", () => {
    const newStart = addDays(currentWeekStart, 7);
    if (newStart > maxWeekStart) return;
    currentWeekStart = newStart;
    renderAvailabilityCards();
  });

  // Initial: Daten für alle 3 Wochen laden, dann aktuelle Woche rendern
  loadDateAvailabilityForRange().then(() => {
    renderAvailabilityCards();
  });
}

// ================================
// Navigation & Logout
// ================================
backBtn.addEventListener("click", () => {
  window.location.href = "index.html";
});

adminLogoutBtn.addEventListener("click", () => {
  sessionStorage.removeItem("adminAccess");
  window.location.href = "login.html";
});
