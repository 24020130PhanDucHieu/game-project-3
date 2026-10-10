// =============================================================================
// MODAL CONTROLLER MODULE
// =============================================================================

export function openModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.add('active');
}

export function closeModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.remove('active');
}

export function setupModalDismissers() {
  document.querySelectorAll('.modal-overlay .btn-close, .modal-overlay [data-dismiss]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const overlay = e.target.closest('.modal-overlay');
      if (overlay) overlay.classList.remove('active');
    });
  });
}
