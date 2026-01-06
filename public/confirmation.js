// Eigene Service- und Extras-Liste für die Bestätigungsseite
const services = [
    { id: "service-1", name: "Taper" },
    { id: "service-2", name: "Fade" },
    { id: "service-3", name: "Taper + Trim" },
    { id: "service-4", name: "Fade + Trim" },
    { id: "service-5", name: "Haarschnitt + Bart" },
    { id: "service-6", name: "Scissor Cut" }
  ];
  
  const extrasList = [
    { id: "extras-1", name: "Bart" },
    { id: "extras-2", name: "Design" }
  ];
  
  document.addEventListener("DOMContentLoaded", () => {
    const summaryDiv = document.getElementById("booking-summary");
    const backBtn = document.getElementById("back-btn");
    const logoutBtn = document.getElementById("logout-btn");
  
    const raw = localStorage.getItem("lastBooking");
  
    if (!raw) {
      summaryDiv.innerHTML = "<p>Es konnten keine Buchungsdaten gefunden werden.</p>";
    } else {
      const booking = JSON.parse(raw);
  
      // Datum formatiert
      const dateObj = new Date(booking.date);
      const dateStr = dateObj.toLocaleDateString("de-DE", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
  
      const timeStr = booking.time || "-";
  
      const service = services.find(s => s.id === booking.serviceId);
      const serviceName = service ? service.name : "Gewählter Service";
  
      const extrasNames = (booking.extras || [])
        .map(id => {
          const ex = extrasList.find(e => e.id === id);
          return ex ? ex.name : null;
        })
        .filter(Boolean);
  
      summaryDiv.innerHTML = `
        <p><strong>Name:</strong> ${booking.customer?.name || "-"}</p>
        <p><strong>Telefon:</strong> ${booking.customer?.phone || "-"}</p>
        <p><strong>Datum:</strong> ${dateStr}</p>
        <p><strong>Uhrzeit:</strong> ${timeStr} Uhr</p>
        <p><strong>Service:</strong> ${serviceName}</p>
        <p><strong>Extras:</strong> ${extrasNames.length ? extrasNames.join(", ") : "Keine"}</p>
        <p><strong>Notiz:</strong> ${booking.note || "Keine"}</p>
      `;
    }
  
    backBtn.addEventListener("click", () => {
      // Optional: Bestätigung aufräumen
      localStorage.removeItem("lastBooking");
      window.location.href = "index.html";
    });

    logoutBtn.addEventListener("click", () => {
      sessionStorage.removeItem("access");
      window.location.href = "login.html";
    });
    
  });
  