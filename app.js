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
