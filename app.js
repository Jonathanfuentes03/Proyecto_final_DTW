/* ═══════════════════════════════════════════════════════════════
   MEDI-Registro de pacientes — app.js
   ▸ CRUD completo con validaciones y manejo de errores (Try/Catch)
   ▸ Web Worker inline para métricas
   ▸ LocalStorage (pacientes) + SessionStorage (sesión de usuario)
   ▸ Fetch API → Open-Meteo (clima) + Nominatim (geocodificación inversa)
   ▸ Geolocalización del navegador
   ▸ Manipulación del DOM
═══════════════════════════════════════════════════════════════ */
 
"use strict";
/* ───────────────────────────────────────────
   1. WEB WORKER — Se crea como Blob inline
   para que funcione sin servidor HTTP
─────────────────────────────────────────── */
const WORKER_CODE = `
  self.onmessage = function(e) {
    const patients = e.data;

    // Calcular métricas
    const total    = patients.length;
    const active   = patients.filter(p => p.status === "activo").length;
    const inactive = patients.filter(p => p.status === "inactivo").length;
    const critical = patients.filter(p => p.status === "crítico").length;

    const avgAge = total > 0
      ? Math.round(patients.reduce((s, p) => s + (parseInt(p.age) || 0), 0) / total)
      : 0;

    // Rangos de edad
    const ranges = { "0-17": 0, "18-35": 0, "36-55": 0, "56-70": 0, "71+": 0 };
    patients.forEach(p => {
      const a = parseInt(p.age) || 0;
      if (a <= 17)       ranges["0-17"]++;
      else if (a <= 35)  ranges["18-35"]++;
      else if (a <= 55)  ranges["36-55"]++;
      else if (a <= 70)  ranges["56-70"]++;
      else               ranges["71+"]++;
    });

    self.postMessage({ total, active, inactive, critical, avgAge, ranges,
      timestamp: new Date().toISOString() });
  };
`;

let metricsWorker = null;
try {
  const blob   = new Blob([WORKER_CODE], { type: "application/javascript" });
  const blobUrl = URL.createObjectURL(blob);
  metricsWorker = new Worker(blobUrl);
  metricsWorker.onmessage = handleWorkerResult;
  metricsWorker.onerror = (err) => {
    console.error("Worker error:", err);
    logWorker("❌ Error en Web Worker: " + err.message);
  };
} catch (err) {
  console.error("No se pudo crear el Web Worker:", err);
}

/* ─────────────────────────────────────────── 
   2. STORAGE — LocalStorage + SessionStorage 
─────────────────────────────────────────── */ 
const LS_KEY  = "medregister_patients"; 
const SS_KEY  = "medregister_session"; 

function loadPatients() { 
  try { 
    const raw = localStorage.getItem(LS_KEY); 
    return raw ? JSON.parse(raw) : []; 
  } catch (err) { 
    console.error("Error leyendo LocalStorage:", err); 
    return []; 
  } 
} 

function savePatients(list) { 
  try { 
    localStorage.setItem(LS_KEY, JSON.stringify(list)); 
  } catch (err) { 
    showToast("❌ Error al guardar en LocalStorage: " + err.message, "error"); 
  } 
} 

function initSession() { 
  try { 
    let session = sessionStorage.getItem(SS_KEY); 
    if (!session) { 
      const data = { 
        sessionId: "SES-" + Date.now(), 
        startedAt: new Date().toLocaleString("es-CO"), 
        user: "Operador" 
      }; 
      sessionStorage.setItem(SS_KEY, JSON.stringify(data)); 
      session = JSON.stringify(data); 
    } 
    const parsed = JSON.parse(session); 
    document.getElementById("session-info").textContent = 
      `👤 ${parsed.user} · ${parsed.startedAt}`; 
  } catch (err) { 
    console.error("Error en SessionStorage:", err); 
  } 
} 

/* ───────────────────────────────────────────
   3. ESTADO GLOBAL
─────────────────────────────────────────── */
let patients = loadPatients();
let deleteTargetId = null;
let editingId = null;
 
/* ───────────────────────────────────────────
   4. UTILIDADES DOM
─────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
 
function showToast(msg, type = "info") {
  const t = $("toast");
  t.textContent = msg;
  t.className = `toast toast-${type}`;
  t.classList.remove("hidden");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add("hidden"), 3500);
}
 
function showFeedback(msg, type) {
  const fb = $("form-feedback");
  fb.textContent = msg;
  fb.className = `form-feedback ${type}`;
  fb.classList.remove("hidden");
  setTimeout(() => fb.classList.add("hidden"), 4000);
}
 
function setFieldError(fieldId, msg) {
  const el = $("err-" + fieldId);
  if (el) el.textContent = msg;
  const input = $("field-" + fieldId);
  if (input) {
    if (msg) input.classList.add("input-error");
    else input.classList.remove("input-error");
  }
}
 
function clearAllErrors() {
  ["name","age","gender","diagnosis","phone","status"].forEach(f => setFieldError(f, ""));
}

/* ───────────────────────────────────────────
   5. VALIDACIONES (con Try/Catch)
─────────────────────────────────────────── */
function validateForm() {
  clearAllErrors();
  let valid = true;
 
  try {
    const name = $("field-name").value.trim();
    if (!name || name.length < 2) {
      setFieldError("name", "Nombre requerido (mínimo 2 caracteres).");
      valid = false;
    } else if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s'-]+$/.test(name)) {
      setFieldError("name", "Solo se permiten letras y espacios.");
      valid = false;
    }
 
    const age = parseInt($("field-age").value);
    if (isNaN(age) || age < 0 || age > 130) {
      setFieldError("age", "Ingresa una edad válida (0–130).");
      valid = false;
    }
 
    if (!$("field-gender").value) {
      setFieldError("gender", "Selecciona un género.");
      valid = false;
    }
 
    const diag = $("field-diagnosis").value.trim();
    if (!diag || diag.length < 3) {
      setFieldError("diagnosis", "Diagnóstico requerido (mínimo 3 caracteres).");
      valid = false;
    }
 
    const phone = $("field-phone").value.trim();
    if (phone && !/^[\d\s\+\-\(\)]{7,20}$/.test(phone)) {
      setFieldError("phone", "Formato de teléfono no válido.");
      valid = false;
    }
 
    if (!$("field-status").value) {
      setFieldError("status", "Selecciona un estado.");
      valid = false;
    }
  } catch (err) {
    console.error("Error durante validación:", err);
    valid = false;
  }
 
  return valid;
}

/* ───────────────────────────────────────────
   6. CRUD — Crear / Editar / Eliminar / Listar
─────────────────────────────────────────── */
function generateId() {
  return "PAC-" + Date.now().toString(36).toUpperCase() +
    Math.random().toString(36).substring(2, 5).toUpperCase();
}
 
/* CREATE / UPDATE */
function savePatient(e) {
  e.preventDefault();
  if (!validateForm()) return;
 
  try {
    const id = $("field-id").value || generateId();
    const isNew = !$("field-id").value;
 
    const patient = {
      id,
      name:      $("field-name").value.trim(),
      age:       parseInt($("field-age").value),
      gender:    $("field-gender").value,
      diagnosis: $("field-diagnosis").value.trim(),
      phone:     $("field-phone").value.trim(),
      status:    $("field-status").value,
      notes:     $("field-notes").value.trim(),
      createdAt: isNew ? new Date().toLocaleDateString("es-CO") : (getPatientById(id)?.createdAt || ""),
      updatedAt: new Date().toLocaleDateString("es-CO")
    };
 
    if (isNew) {
      patients.unshift(patient);
    } else {
      const idx = patients.findIndex(p => p.id === id);
      if (idx !== -1) patients[idx] = patient;
    }
 
    savePatients(patients);
    resetForm();
    renderTable();
    triggerWorker();
    showFeedback(isNew ? "Paciente registrado exitosamente." : "Paciente actualizado.", "success");
    showToast(isNew ? `Paciente "${patient.name}" registrado.` : `Paciente "${patient.name}" actualizado.`, "success");
    switchTab("patients");
  } catch (err) {
    showFeedback("❌ Error al guardar: " + err.message, "error");
    console.error("savePatient error:", err);
  }
}
 
/* READ */
function getPatientById(id) {
  return patients.find(p => p.id === id) || null;
}

/* EDIT — carga datos en el formulario */
function startEdit(id) {
  try {
    const p = getPatientById(id);
    if (!p) throw new Error("Paciente no encontrado: " + id);
 
    editingId = id;
    $("field-id").value       = p.id;
    $("field-name").value     = p.name;
    $("field-age").value      = p.age;
    $("field-gender").value   = p.gender;
    $("field-diagnosis").value= p.diagnosis;
    $("field-phone").value    = p.phone || "";
    $("field-status").value   = p.status;
    $("field-notes").value    = p.notes || "";
 
    $("form-heading").textContent    = "Editar Paciente";
    $("form-subheading").textContent = `Editando ID: ${p.id}`;
    $("btn-submit").textContent      = "Actualizar Paciente";
    switchTab("register");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    showToast("❌ " + err.message, "error");
    console.error("startEdit error:", err);
  }
}
 
function resetForm() {
  $("patient-form").reset();
  $("field-id").value = "";
  editingId = null;
  $("form-heading").textContent    = "Registrar Paciente";
  $("form-subheading").textContent = "Complete todos los campos obligatorios marcados con *";
  $("btn-submit").textContent      = "Guardar Paciente";
  clearAllErrors();
  $("form-feedback").classList.add("hidden");
}
 
/* DELETE — confirmación modal */
function requestDelete(id) {
  try {
    const p = getPatientById(id);
    if (!p) throw new Error("Paciente no encontrado.");
    deleteTargetId = id;
    $("modal-msg").textContent = `¿Deseas eliminar a "${p.name}" (${p.id})?`;
    $("modal-overlay").classList.remove("hidden");
  } catch (err) {
    showToast(err.message, "error");
  }
}
 
function confirmDelete() {
  try {
    if (!deleteTargetId) return;
    const p = getPatientById(deleteTargetId);
    patients = patients.filter(pt => pt.id !== deleteTargetId);
    savePatients(patients);
    renderTable();
    triggerWorker();
    showToast(`🗑 Paciente "${p?.name}" eliminado.`, "error");
  } catch (err) {
    showToast("Error al eliminar: " + err.message, "error");
  } finally {
    deleteTargetId = null;
    $("modal-overlay").classList.add("hidden");
  }
}

/* ─────────────────────────────────────────── 
   7. RENDER TABLE (Manipulación del DOM) 
─────────────────────────────────────────── */ 
function renderTable(list) { 
  const data   = list || getFilteredList(); 
  const tbody  = $("patients-tbody"); 
  const empty  = $("empty-state"); 
  const table  = document.querySelector(".patients-table"); 

  tbody.innerHTML = ""; 

  if (data.length === 0) { 
    table.style.display  = "none"; 
    empty.classList.remove("hidden"); 
    return; 
  } 

  table.style.display = ""; 
  empty.classList.add("hidden"); 
  const fragment = document.createDocumentFragment(); 

  data.forEach(p => { 
    const tr = document.createElement("tr"); 
    tr.innerHTML = ` 
      <td><code style="font-size:11px;color:var(--text-muted)">${escHtml(p.id)}</code></td> 
      <td><strong>${escHtml(p.name)}</strong></td> 
      <td>${escHtml(String(p.age))}</td> 
      <td>${escHtml(p.gender)}</td> 
      <td>${escHtml(p.diagnosis)}</td> 
      <td><span class="badge badge-${escHtml(p.status)}">${escHtml(p.status)}</span></td> 
      <td>${escHtml(p.createdAt || "—")}</td> 
      <td style="white-space:nowrap"> 
        <button class="action-btn edit"   data-id="${escHtml(p.id)}">✏ Editar</button> 
        <button class="action-btn delete" data-id="${escHtml(p.id)}" style="margin-left:6px">🗑 Eliminar</button> 
      </td>`; 
    fragment.appendChild(tr); 
  }); 

  tbody.appendChild(fragment); 
  
  // Eventos de tabla — delegados 
  tbody.querySelectorAll(".action-btn.edit").forEach(btn => 
    btn.addEventListener("click", () => startEdit(btn.dataset.id)) 
  ); 
  tbody.querySelectorAll(".action-btn.delete").forEach(btn => 
    btn.addEventListener("click", () => requestDelete(btn.dataset.id)) 
  ); 
} 

function escHtml(str) { 
  return String(str) 
    .replace(/&/g,"&amp;").replace(/</g,"&lt;") 
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;"); 
} 

function getFilteredList() { 
  const query  = $("search-input")?.value?.toLowerCase() || ""; 
  const status = $("filter-status")?.value || ""; 
  return patients.filter(p => { 
    const matchQuery  = !query || 
      p.name.toLowerCase().includes(query) || 
      p.id.toLowerCase().includes(query) || 
      p.diagnosis.toLowerCase().includes(query); 
    const matchStatus = !status || p.status === status; 
    return matchQuery && matchStatus; 
  }); 
} 

/* ───────────────────────────────────────────
   8. WEB WORKER — Envío y recepción
─────────────────────────────────────────── */
function triggerWorker() {
  if (!metricsWorker) { updateKPIs({ total:0, active:0, inactive:0, critical:0, avgAge:0, ranges:{} }); return; }
  logWorker("⏳ Procesando " + patients.length + " registro(s)…");
  metricsWorker.postMessage(patients);
}
 
function handleWorkerResult(e) {
  const m = e.data;
  logWorker(`Cálculo completado a las ${new Date(m.timestamp).toLocaleTimeString("es-CO")}`);
  logWorker(`   Total: ${m.total} | Activos: ${m.active} | Inactivos: ${m.inactive} | Críticos: ${m.critical} | Edad prom: ${m.avgAge}`);
  updateKPIs(m);
}
 
function logWorker(msg) {
  const log = $("worker-log");
  const idle = log.querySelector(".worker-idle");
  if (idle) idle.remove();
  const p = document.createElement("p");
  p.textContent = "> " + msg;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
}
 
function updateKPIs(m) {
  $("kpi-total").textContent    = m.total;
  $("kpi-active").textContent   = m.active;
  $("kpi-inactive").textContent = m.inactive;
  $("kpi-critical").textContent = m.critical;
  $("kpi-avg-age").textContent  = m.avgAge || "—";
 
  const pct = (v) => m.total > 0 ? Math.round(v / m.total * 100) : 0;
  $("bar-active").style.width   = pct(m.active)   + "%";
  $("bar-inactive").style.width = pct(m.inactive) + "%";
  $("bar-critical").style.width = pct(m.critical) + "%";
 
  renderAgeChart(m.ranges || {});
}
 
function renderAgeChart(ranges) {
  const container = $("age-chart");
  container.innerHTML = "";
  const max = Math.max(...Object.values(ranges), 1);
 
  Object.entries(ranges).forEach(([label, count]) => {
    const pct = Math.round((count / max) * 100);
    const wrap = document.createElement("div");
    wrap.className = "age-bar-wrap";
    wrap.innerHTML = `
      <div class="age-bar-count">${count}</div>
      <div class="age-bar-fill" style="height:${pct}%"></div>
      <div class="age-bar-label">${label}</div>`;
    container.appendChild(wrap);
  });
}

/* ───────────────────────────────────────────
   9. GEOLOCALIZACIÓN + FETCH API (Open-Meteo)
─────────────────────────────────────────── */
$("btn-geo").addEventListener("click", getUserLocation);
 
function getUserLocation() {
  const geoBox = $("geo-info");
  geoBox.innerHTML = `<p style="color:var(--text-muted);font-size:13px">📡 Obteniendo ubicación…</p>`;
 
  if (!navigator.geolocation) {
    geoBox.innerHTML = `<p style="color:var(--danger);font-size:13px">❌ Geolocalización no soportada por este navegador.</p>`;
    return;
  }
 
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lon, accuracy } = pos.coords;
      try {
        // Mostrar coordenadas básicas de inmediato
        geoBox.innerHTML = `
          <div class="geo-data">
            <div class="geo-row"><strong>Latitud:</strong> ${lat.toFixed(5)}°</div>
            <div class="geo-row"><strong>Longitud:</strong> ${lon.toFixed(5)}°</div>
            <div class="geo-row"><strong>Precisión:</strong> ±${Math.round(accuracy)} m</div>
            <div class="geo-row" id="geo-city"><strong>Ciudad:</strong> <em>cargando…</em></div>
          </div>`;
 
        // Fetch 1 — Geocodificación inversa con Nominatim
        await fetchCityName(lat, lon);
 
        // Fetch 2 — Clima con Open-Meteo
        await fetchWeather(lat, lon);
      } catch (err) {
        console.error("Geo fetch error:", err);
        showToast("⚠ No se pudo obtener datos adicionales de ubicación.", "info");
      }
    },
    (err) => {
      const msgs = {
        1: "Permiso denegado por el usuario.",
        2: "Posición no disponible.",
        3: "Tiempo de espera agotado."
      };
      geoBox.innerHTML = `<p style="color:var(--danger);font-size:13px">❌ ${msgs[err.code] || err.message}</p>`;
    },
    { timeout: 12000, maximumAge: 60000 }
  );
}
 
async function fetchCityName(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const res  = await fetch(url, {
      headers: { "Accept-Language": "es", "User-Agent": "MedRegister/1.0" }
    });
    if (!res.ok) throw new Error("Nominatim HTTP " + res.status);
    const data = await res.json();  // Manejo de JSON
 
    const city = data.address?.city || data.address?.town ||
                 data.address?.village || data.address?.county || "Desconocida";
    const country = data.address?.country || "";
    const row = $("geo-city");
    if (row) row.innerHTML = `<strong>Ciudad:</strong> ${escHtml(city)}, ${escHtml(country)}`;
  } catch (err) {
    const row = $("geo-city");
    if (row) row.innerHTML = `<strong>Ciudad:</strong> No disponible`;
    console.warn("fetchCityName error:", err);
  }
}
 
async function fetchWeather(lat, lon) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
                `&current_weather=true&hourly=relative_humidity_2m` +
                `&timezone=auto&forecast_days=1`;
    const res  = await fetch(url);
    if (!res.ok) throw new Error("Open-Meteo HTTP " + res.status);
    const data = await res.json();  // Manejo de JSON
 	
    const cw   = data.current_weather;
    const wmo  = {
      0:"☀ Despejado", 1:"🌤 Mayormente despejado", 2:"⛅ Parcialmente nublado",
      3:"☁ Nublado", 45:"🌫 Neblina", 48:"🌫 Escarcha", 51:"🌦 Llovizna ligera",
      61:"🌧 Lluvia moderada", 63:"🌧 Lluvia fuerte", 80:"🌦 Chubascos",
      95:"⛈ Tormenta"
    };
    const cond = wmo[cw.weathercode] || `Código ${cw.weathercode}`;
    const humidity = data.hourly?.relative_humidity_2m?.[0] ?? "N/D";
 
    const wb = $("weather-info");
    wb.classList.remove("hidden");
    wb.innerHTML = `
      <strong style="font-size:14px;display:block;margin-bottom:8px">🌡 Clima actual</strong>
      <div class="geo-data">
        <div class="geo-row"><strong>Condición:</strong> ${escHtml(cond)}</div>
        <div class="geo-row"><strong>Temperatura:</strong> ${cw.temperature}°C</div>
        <div class="geo-row"><strong>Viento:</strong> ${cw.windspeed} km/h</div>
        <div class="geo-row"><strong>Humedad:</strong> ${humidity}%</div>
      </div>`;
    showToast("📍 Ubicación y clima obtenidos con éxito.", "success");
  } catch (err) {
    console.warn("fetchWeather error:", err);
    const wb = $("weather-info");
    wb.classList.remove("hidden");
    wb.innerHTML = `<p style="color:var(--text-muted);font-size:13px">⚠ Clima no disponible en este momento.</p>`;
  }
}

/* ───────────────────────────────────────────
   10. NAVEGACIÓN ENTRE TABS
─────────────────────────────────────────── */
function switchTab(tabName) {
  $$(".tab-content").forEach(s => s.classList.remove("active"));
  $$(".nav-btn").forEach(b => b.classList.remove("active"));
 
  const section = $("tab-" + tabName);
  const btn     = document.querySelector(`.nav-btn[data-tab="${tabName}"]`);
  if (section) section.classList.add("active");
  if (btn)     btn.classList.add("active");
 
  if (tabName === "dashboard") triggerWorker();
  if (tabName === "patients")  renderTable();
}
 
$$(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});
 
/* Botón "Registrar primer paciente" en empty-state */
document.addEventListener("click", e => {
  const tab = e.target.dataset?.tab;
  if (tab) switchTab(tab);
});
 
/* ───────────────────────────────────────────
   11. EVENTOS DE FORMULARIO Y MODAL
─────────────────────────────────────────── */
$("patient-form").addEventListener("submit", savePatient);
 
$("btn-cancel-form").addEventListener("click", () => {
  resetForm();
  switchTab("patients");
});
 
$("btn-confirm-delete").addEventListener("click", confirmDelete);
$("btn-cancel-delete").addEventListener("click", () => {
  deleteTargetId = null;
  $("modal-overlay").classList.add("hidden");
});
 
$("modal-overlay").addEventListener("click", e => {
  if (e.target === $("modal-overlay")) {
    deleteTargetId = null;
    $("modal-overlay").classList.add("hidden");
  }
});
 
/* Filtros en tabla */
$("search-input").addEventListener("input", () => renderTable());
$("filter-status").addEventListener("change", () => renderTable());
 
/* Recalcular manualmente */
$("btn-recalc").addEventListener("click", () => {
  logWorker("🔄 Recálculo manual solicitado…");
  triggerWorker();
  showToast("🔄 Recalculando métricas…", "info");
});
 
/* ───────────────────────────────────────────
   12. DATOS DE MUESTRA (si no hay registros)
─────────────────────────────────────────── */
function seedSampleData() {
  if (patients.length > 0) return;
  const sample = [
    { id: generateId(), name: "María García López",     age: 45, gender: "Femenino",  diagnosis: "Diabetes tipo 2",       phone: "+57 310 234 5678", status: "activo",   notes: "Controles cada 3 meses.",          createdAt: "01/01/2025", updatedAt: "01/01/2025" },
    { id: generateId(), name: "Carlos Rodríguez Peña",  age: 62, gender: "Masculino", diagnosis: "Hipertensión arterial",  phone: "+57 315 876 5432", status: "activo",   notes: "Medicación Enalapril 10mg.",       createdAt: "05/01/2025", updatedAt: "05/01/2025" },
    { id: generateId(), name: "Ana Martínez Vega",      age: 28, gender: "Femenino",  diagnosis: "Ansiedad generalizada", phone: "",                 status: "inactivo", notes: "Alta temporal.",                   createdAt: "10/02/2025", updatedAt: "10/02/2025" },
    { id: generateId(), name: "Luis Hernández Torres",  age: 77, gender: "Masculino", diagnosis: "Insuficiencia cardiaca",phone: "+57 320 111 2233", status: "crítico",  notes: "Monitoreo continuo requerido.",    createdAt: "15/02/2025", updatedAt: "01/03/2025" },
    { id: generateId(), name: "Sofía Morales Ruiz",     age: 14, gender: "Femenino",  diagnosis: "Asma bronquial",        phone: "+57 312 909 8765", status: "activo",   notes: "Inhalador de rescate siempre.",   createdAt: "20/03/2025", updatedAt: "20/03/2025" },
    { id: generateId(), name: "Jorge Ramírez Cruz",     age: 53, gender: "Masculino", diagnosis: "Artritis reumatoide",   phone: "+57 316 543 2109", status: "inactivo", notes: "En remisión desde enero.",         createdAt: "01/04/2025", updatedAt: "01/04/2025" },
    { id: generateId(), name: "Patricia Díaz Medina",   age: 38, gender: "Femenino",  diagnosis: "Migraña crónica",       phone: "+57 314 678 9012", status: "activo",   notes: "Profilaxis con Topiramato.",       createdAt: "12/04/2025", updatedAt: "12/04/2025" },
    { id: generateId(), name: "Roberto Sánchez Blanco", age: 88, gender: "Masculino", diagnosis: "Parkinson estadio III", phone: "+57 318 234 5670", status: "crítico",  notes: "Fisioterapia diaria. Acompañante.", createdAt: "20/04/2025", updatedAt: "20/04/2025" },
  ];
  patients = sample;
  savePatients(patients);
}
 
/* ───────────────────────────────────────────
   13. INICIALIZACIÓN
─────────────────────────────────────────── */
(function init() {
  try {
    initSession();
    seedSampleData();
    renderTable();
    triggerWorker();
    switchTab("dashboard");
  } catch (err) {
    console.error("Error en inicialización:", err);
    showToast("❌ Error al iniciar la aplicación.", "error");
  }
})();


