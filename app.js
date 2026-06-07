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
