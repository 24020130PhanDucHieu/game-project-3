async function loadTemplates() {
  const elements = document.querySelectorAll('[data-include]');
  for (let el of elements) {
    const file = el.getAttribute('data-include');
    try {
      const response = await fetch(file);
      if (response.ok) {
        const html = await response.text();
        el.outerHTML = html;
      }
    } catch (e) {
      console.error(`Error loading template ${file}`, e);
    }
  }
}

// Ensure templates are loaded before app.js runs
loadTemplates().then(() => {
  const script = document.createElement('script');
  script.src = 'app.js';
  document.body.appendChild(script);
});
