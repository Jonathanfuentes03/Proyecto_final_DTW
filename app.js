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
    showFeedback(isNew ? "✅ Paciente registrado exitosamente." : "✅ Paciente actualizado.", "success");
    showToast(isNew ? `✅ Paciente "${patient.name}" registrado.` : `✅ Paciente "${patient.name}" actualizado.`, "success");
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
    showToast("❌ " + err.message, "error");
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
    showToast("❌ Error al eliminar: " + err.message, "error");
  } finally {
    deleteTargetId = null;
    $("modal-overlay").classList.add("hidden");
  }
}
