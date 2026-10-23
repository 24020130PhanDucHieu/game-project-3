"""Build the Next.js static export served by the Go gateway."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"


def remove_generated_legacy_assets():
    public = FRONTEND / "public"
    if public.is_symlink() or public.resolve() != public:
        raise ValueError("frontend/public must be a directory inside the workspace")
    for name in ("static", "assets", "sw.js", "offline-assets.json"):
        target = public / name
        if target.is_symlink() or target.resolve().parent != public.resolve():
            raise ValueError(f"Legacy asset path redirects outside frontend/public: {target}")
        if target.is_dir():
            shutil.rmtree(target)
        elif target.exists():
            target.unlink()
    generated_dir = FRONTEND / "generated"
    if generated_dir.is_symlink() or generated_dir.resolve() != generated_dir:
        raise ValueError("frontend/generated must be inside the workspace")
    generated = generated_dir / "portal.json"
    if generated.is_symlink() or generated.resolve().parent != generated_dir:
        raise ValueError("Generated portal path redirects outside frontend/generated")
    generated.unlink(missing_ok=True)


def build_next(destination: Path):
    if destination.is_symlink():
        raise ValueError("Frontend output must not be a symlink")
    destination = destination.resolve()
    if destination != FRONTEND / "dist":
        raise ValueError("Frontend output must be frontend/dist")
    npm = shutil.which("npm")
    if not npm:
        raise RuntimeError("Node.js and npm are required to build the frontend")
    remove_generated_legacy_assets()
    if not (FRONTEND / "node_modules" / "next").is_dir():
        subprocess.run([npm, "ci"], cwd=FRONTEND, check=True)
    environment = dict(os.environ, ARENA_STATIC_EXPORT="1", NEXT_TELEMETRY_DISABLED="1")
    subprocess.run([npm, "run", "build"], cwd=FRONTEND, env=environment, check=True)
    output = FRONTEND / "out"
    html = (output / "index.html").read_text(encoding="utf-8")
    if "/_next/" not in html:
        raise RuntimeError("Next export did not contain the application")
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(output, destination)
    print(f"Next frontend built: {destination}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=FRONTEND / "dist")
    build_next(parser.parse_args().output)
