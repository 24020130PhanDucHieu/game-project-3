// =============================================================================
// ADMIN CONTROLS MODULE - BTC GAME MUTATIONS & RULE OVERRIDES
// =============================================================================

export function setupAdminRules() {
  const suddenDeathToggle = document.getElementById('toggle-sudden-death');
  const doubleDamageToggle = document.getElementById('toggle-double-damage');

  if (suddenDeathToggle) {
    suddenDeathToggle.addEventListener('change', (e) => {
      console.log('[Admin] Sudden Death toggled:', e.target.checked);
    });
  }

  if (doubleDamageToggle) {
    doubleDamageToggle.addEventListener('change', (e) => {
      console.log('[Admin] Double Damage toggled:', e.target.checked);
    });
  }
}
