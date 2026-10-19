"""Assemble Go-compatible HTML templates for static hosting (no dependencies)."""
import argparse
import json
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
INCLUDE = re.compile(r'\{\{template\s+"([\w./-]+\.html)"\s+\.\}\}')


def render_templates():
    templates = {}
    for path in (FRONTEND / "templates").rglob("*.html"):
        name = path.relative_to(FRONTEND / "templates").as_posix()
        templates[name] = path.read_text(encoding="utf-8")

    def render(name, stack=()):
        if name in stack:
            raise ValueError(f"Circular template include: {name}")
        return INCLUDE.sub(lambda match: render(match[1], stack + (name,)), templates[name])

    return render("index.html")


def build(destination):
    destination = destination.resolve()
    if destination in (FRONTEND, ROOT) or any(
        destination == FRONTEND / name or FRONTEND / name in destination.parents
        for name in ("templates", "static", "assets")
    ):
        raise ValueError("Output must be separate from frontend source files")
    html = render_templates()
    destination.mkdir(parents=True, exist_ok=True)
    # Remove only directories this builder owns, inside the explicit output folder.
    for directory in ("static", "assets"):
        source = FRONTEND / directory
        target = destination / directory
        if target.is_symlink() or target.resolve() != destination / directory:
            raise ValueError(f"Output directory must not redirect outside its build folder: {target}")
        if target.is_dir():
            shutil.rmtree(target)
        if source.is_dir():
            shutil.copytree(source, target)
    temporary = destination / "index.html.tmp"
    temporary.write_text(html, encoding="utf-8")
    temporary.replace(destination / "index.html")
    shutil.copyfile(FRONTEND / 'sw.js', destination / 'sw.js')
    # Exact query strings match the versioned script/style requests in the HTML.
    urls = {'/', '/index.html'}
    urls.update(re.findall(r'(?:src|href)="(/(?:static|assets)/[^"?#]+(?:\?[^"#]*)?)"', html))
    for path in (destination / 'assets').rglob('*'):
        if path.is_file():
            urls.add('/' + path.relative_to(destination).as_posix())
    (destination / 'offline-assets.json').write_text(json.dumps(sorted(urls)), encoding='utf-8')
    print(f"Frontend built: {destination}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=FRONTEND / "dist")
    build(parser.parse_args().output)
