"""Assemble Go-compatible HTML templates for static hosting (no dependencies)."""
import argparse
import json
from pathlib import Path
import re
import shutil
import os
import subprocess
import hashlib

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
LEGACY_FRONTEND = FRONTEND / "legacy"
INCLUDE = re.compile(r'\{\{template\s+"([\w./-]+\.html)"\s+\.\}\}')


def render_templates():
    templates = {}
    for path in (LEGACY_FRONTEND / "templates").rglob("*.html"):
        name = path.relative_to(LEGACY_FRONTEND / "templates").as_posix()
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
        source = LEGACY_FRONTEND / directory
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
    shutil.copyfile(LEGACY_FRONTEND / 'sw.js', destination / 'sw.js')
    # Exact query strings match the versioned script/style requests in the HTML.
    urls = {'/', '/index.html'}
    urls.update(re.findall(r'(?:src|href)="(/(?:static|assets)/[^"?#]+(?:\?[^"#]*)?)"', html))
    for path in (destination / 'assets').rglob('*'):
        if path.is_file():
            urls.add('/' + path.relative_to(destination).as_posix())
    (destination / 'offline-assets.json').write_text(json.dumps(sorted(urls)), encoding='utf-8')
    print(f"Frontend built: {destination}")


def build_next(destination):
    app = FRONTEND
    destination = destination.resolve()
    if destination != FRONTEND / 'dist':
        raise ValueError('Next release output must be frontend/dist')
    npm = shutil.which('npm')
    if not npm:
        raise RuntimeError('Node.js and npm are required to build the main frontend')
    if not (app / 'node_modules' / 'next').is_dir():
        subprocess.run([npm, 'ci'], cwd=app, check=True)
    environment = dict(os.environ, ARENA_STATIC_EXPORT='1', NEXT_TELEMETRY_DISABLED='1')
    subprocess.run([npm, 'run', 'build'], cwd=app, env=environment, check=True)
    output = app / 'out'
    html = (output / 'index.html').read_text(encoding='utf-8')
    if '/_next/' not in html:
        raise RuntimeError('Next export did not contain the functional Next.js application')
    if (output / 'offline-assets.json').exists():
        urls = set(json.loads((output / 'offline-assets.json').read_text(encoding='utf-8')))
    else:
        urls = set()
    urls.update('/' + p.relative_to(output).as_posix() for p in (output / '_next' / 'static').rglob('*') if p.is_file())
    (output / 'offline-assets.json').write_text(json.dumps(sorted(urls)), encoding='utf-8')
    digest = hashlib.sha256(html.encode()).hexdigest()[:16]
    if (output / 'sw.js').exists():
        sw = (output / 'sw.js').read_text(encoding='utf-8')
        sw = re.sub(r"const CACHE='[^']+';", f"const CACHE='arena-static-next-{digest}';", sw)
        (output / 'sw.js').write_text(sw, encoding='utf-8')
    # Replace only this builder's explicit output directory after a successful build.
    if destination.is_symlink() or destination.resolve() != FRONTEND / 'dist':
        raise ValueError('Frontend output must not redirect outside frontend/dist')
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(output, destination)
    print(f'Next main frontend built: {destination}')


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=FRONTEND / "dist")
    parser.add_argument('--legacy', action='store_true', help='Build source-template fallback instead of the Next release')
    args = parser.parse_args()
    (build if args.legacy else build_next)(args.output)
