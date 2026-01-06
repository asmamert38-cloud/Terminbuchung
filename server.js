require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

console.log("MAIL_USER gesetzt?", !!process.env.MAIL_USER);
console.log("MAIL_PASS gesetzt?", !!process.env.MAIL_PASS);


const app = express();
const PORT = 3000;

let transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});


console.log("Starte server.js...");

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Datenordner & Dateien
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

const bookingsFile = path.join(dataDir, "bookings.json");
const availabilityFile = path.join(dataDir, "availability.json");
const dateAvailabilityFile = path.join(dataDir, "dateAvailability.json");

// Beispiel-Services und Extras – müssen zu deinem Frontend passen
const services = [
  { id: "service-1", name: "Taper", duration: 25 },
  { id: "service-2", name: "Fade", duration: 25 },
  { id: "service-3", name: "Taper + Trim", duration: 35 },
  { id: "service-4", name: "Fade + Trim", duration: 35 },
  { id: "service-5", name: "Scissor Cut", duration: 30 }
];

const extrasList = [
  { id: "extras-1", name: "Bart", duration: 15 },
  { id: "extras-2", name: "Design", duration: 5 }
];

// ===================================
// Generische Helper
// ===================================
function timeToMinutes(t) {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function readJsonFile(file, fallback) {
  if (!fs.existsSync(file)) {
    if (fallback !== undefined) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2), "utf8");
      return fallback;
    }
    return [];
  }
  const raw = fs.readFileSync(file, "utf8");
  if (!raw.trim()) return fallback !== undefined ? fallback : [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("Fehler beim Parsen von", file, e);
    return fallback !== undefined ? fallback : [];
  }
}

// ===================================
// Bookings
// ===================================
function readBookings() {
  return readJsonFile(bookingsFile, []);
}

function writeBookings(list) {
  fs.writeFileSync(bookingsFile, JSON.stringify(list, null, 2), "utf8");
}

async function sendBookingNotification(booking) {
  try {
    const { date, time, customer, serviceId, extras = [], note } = booking;

    const service = services.find(s => s.id === serviceId);
    const serviceName = service ? service.name : serviceId;

    const extrasNames = extras
      .map(id => {
        const ex = extrasList.find(e => e.id === id);
        return ex ? ex.name : id;
      })
      .join(", ") || "Keine";

    let mailOptions = {
      from: process.env.MAIL_USER,
      to: "asmamert38@gmail.com",  
      subject: `💈 Neue Buchung am ${date} um ${time}`,
      text: `
Neue Terminbuchung:

Datum: ${date}
Uhrzeit: ${time}

Kunde: ${customer.name}
Telefon: ${customer.phone}

Service: ${serviceName}
Extras: ${extrasNames}
Notiz: ${note || "Keine"}
      `.trim()
    };

    await transporter.sendMail(mailOptions);
    console.log("Benachrichtigungs-Mail gesendet");

  } catch (err) {
    console.error("Fehler beim Senden der Mail:", err);
    // GANZ WICHTIG: NICHT throwen!
  }
}



// ===================================
// Wochen-Verfügbarkeit
// ===================================
function defaultAvailability() {
  return [
    { day: 1, label: "Montag", active: false, ranges: [{ from: "09:00", to: "18:00" }] },
    { day: 2, label: "Dienstag", active: false, ranges: [{ from: "09:00", to: "18:00" }] },
    { day: 3, label: "Mittwoch", active: false, ranges: [{ from: "09:00", to: "18:00" }] },
    { day: 4, label: "Donnerstag", active: false, ranges: [{ from: "09:00", to: "18:00" }] },
    { day: 5, label: "Freitag", active: false, ranges: [{ from: "09:00", to: "18:00" }] },
    { day: 6, label: "Samstag", active: false, ranges: [{ from: "09:00", to: "18:00" }] },
    { day: 0, label: "Sonntag", active: false, ranges: [{ from: "09:00", to: "18:00" }] }
  ];
}

function readAvailability() {
  return readJsonFile(availabilityFile, defaultAvailability());
}

function writeAvailability(list) {
  fs.writeFileSync(availabilityFile, JSON.stringify(list, null, 2), "utf8");
}

// ===================================
// Datumsspezifische Verfügbarkeit
// ===================================
function readDateAvailability() {
  return readJsonFile(dateAvailabilityFile, []);
}

function writeDateAvailability(list) {
  fs.writeFileSync(dateAvailabilityFile, JSON.stringify(list, null, 2), "utf8");
}

// ===================================
// API: Buchungen
// ===================================

// Alle Buchungen
app.get("/api/bookings", (req, res) => {
  const bookings = readBookings();
  res.json(bookings);
});

// Neue Buchung
app.post("/api/bookings", (req, res) => {
  try {
    const booking = req.body;

    // Pflichtfelder prüfen
    if (!booking.date || !booking.time || !booking.serviceId || !booking.customer) {
      return res.status(400).json({ error: "Fehlende Felder" });
    }

    // Service finden
    const service = services.find(s => s.id === booking.serviceId);
    if (!service) {
      return res.status(400).json({ error: "Service nicht gefunden" });
    }

    // Gesamtdauer: Service + Extras
    let totalDuration = service.duration;

    if (Array.isArray(booking.extras)) {
      booking.extras.forEach(id => {
        const extra = extrasList.find(e => e.id === id);
        if (extra) totalDuration += extra.duration;
      });
    }

    const startMinutes = timeToMinutes(booking.time);
    const endMinutes = startMinutes + totalDuration;

    // Bestehende Buchungen laden
    const existing = readBookings();

    // Alte Einträge normalisieren
    const normalized = existing.map(b => {
      let s = b.startTime || b.time; // fallback
      let e = b.endTime;

      if (!e && b.duration && s) {
        e = minutesToTime(timeToMinutes(s) + b.duration);
      }

      return {
        ...b,
        startTime: s,
        endTime: e
      };
    });

    // Konflikt prüfen: Gleicher Tag & Zeit überschneidet sich
    const conflict = normalized.some(b => {
      if (b.date !== booking.date) return false;
      if (!b.startTime || !b.endTime) return false;

      const existingStart = timeToMinutes(b.startTime);
      const existingEnd = timeToMinutes(b.endTime);

      return startMinutes < existingEnd && endMinutes > existingStart;
    });

    if (conflict) {
      return res.status(400).json({
        error: "Dieser Termin überschneidet sich mit einem bestehenden Termin."
      });
    }

    // Neue Buchung erzeugen
    const newBooking = {
      id: Date.now(),
      ...booking,
      startTime: booking.time,
      endTime: minutesToTime(endMinutes),
      duration: totalDuration
    };

    normalized.push(newBooking);
    writeBookings(normalized);

    // Mailversand asynchron – darf den Response NICHT kaputt machen
    sendBookingNotification(newBooking).catch(err => {
      console.error("Unerwarteter Fehler beim Mailversand:", err);
    });

    // WICHTIG: nur diese EINE Erfolg-Antwort
    return res.status(201).json({ success: true, booking: newBooking });

  } catch (err) {
    console.error("Unerwarteter Fehler in /api/bookings:", err);
    return res.status(500).json({ error: "Interner Serverfehler bei der Buchung." });
  }
});

  
// ===================================
// API: Wochen-Verfügbarkeit
// ===================================
app.get("/api/availability", (req, res) => {
  const availability = readAvailability();
  res.json(availability);
});

app.post("/api/availability", (req, res) => {
  const payload = req.body;

  if (!Array.isArray(payload)) {
    return res.status(400).json({ error: "Erwarte ein Array von Verfügbarkeiten." });
  }

  const cleaned = payload.map(item => ({
    day: Number(item.day),
    label: String(item.label || ""),
    active: Boolean(item.active),
    ranges: Array.isArray(item.ranges)
      ? item.ranges.map(r => ({
          from: String(r.from || "09:00"),
          to: String(r.to || "18:00")
        }))
      : []
  }));

  writeAvailability(cleaned);
  res.json({ success: true, availability: cleaned });
});

// ===================================
// API: Datumsspezifische Verfügbarkeit
// ===================================
app.get("/api/date-availability", (req, res) => {
  const all = readDateAvailability();
  const { from, to } = req.query;

  if (!from || !to) {
    return res.json(all);
  }

  const filtered = all.filter(entry => entry.date >= from && entry.date <= to);
  res.json(filtered);
});

app.post("/api/date-availability", (req, res) => {
  const { date, active, ranges } = req.body;

  if (!date) {
    return res.status(400).json({ error: "Feld 'date' ist erforderlich." });
  }

  const normalized = {
    date: String(date), // YYYY-MM-DD
    active: Boolean(active),
    ranges: Array.isArray(ranges)
      ? ranges.map(r => ({
          from: String(r.from || "09:00"),
          to: String(r.to || "18:00")
        }))
      : []
  };

  const all = readDateAvailability();
  const idx = all.findIndex(e => e.date === normalized.date);

  if (idx >= 0) {
    all[idx] = normalized;
  } else {
    all.push(normalized);
  }

  writeDateAvailability(all);
  res.json({ success: true, entry: normalized });
});

// ===================================
// Server starten
// ===================================
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
