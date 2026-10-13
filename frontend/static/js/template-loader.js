// Compatibility entry for static hosts still publishing frontend/ directly.
// Render/Go and frontend/dist already assemble templates before sending HTML.
(async function loadStaticTemplates() {
  const loaded = new Map();
  const include = /\{\{template\s+"([\w./-]+\.html)"\s+\.\}\}/g;

  async function compose(name, ancestors = []) {
    if (ancestors.includes(name)) throw new Error(`Circular template include: ${name}`);
    if (!/^[\w/-]+\.html$/.test(name) || name.includes("..")) throw new Error("Invalid template path");
    if (!loaded.has(name)) {
      loaded.set(name, fetch(`/templates/${name}?v=4.3`, { cache: "no-cache" }).then(response => {
        if (!response.ok) throw new Error(`Template unavailable: ${name}`);
        return response.text();
      }));
    }
    const source = await loaded.get(name);
    const matches = [...source.matchAll(include)];
    const fragments = await Promise.all(matches.map(match => compose(match[1], [...ancestors, name])));
    let cursor = 0;
    return source.replace(include, () => fragments[cursor++]);
  }

  try {
    const html = await compose("index.html");
    // Only local, version-controlled HTML templates are written here.
    document.open();
    document.write(html);
    document.close();
  } catch (error) {
    console.error("Frontend could not load", error);
    document.getElementById("frontend-loading-message").textContent = "Không tải được đấu trường. Vui lòng tải lại trang.";
  }
})();
