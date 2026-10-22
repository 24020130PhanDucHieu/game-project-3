"""Package only tracked application files; never include deployment secrets."""
import argparse
import io
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--binary', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
tracked = subprocess.check_output(['git', 'ls-files', '-z', 'bot-runner', 'database', 'frontend', 'scripts'], cwd=ROOT).decode().split('\0')
with tarfile.open(args.output, 'w:gz') as archive:
    archive.add(args.binary, arcname='server')
    files = [ROOT / name for name in tracked if name]
    files += list((ROOT / 'deploy/ec2').glob('*'))
    for path in files:
        if not path.is_file() or path.is_symlink():
            continue
        if path.name.startswith('.env') or path.suffix in ('.pem', '.key'):
            raise ValueError(f'Secret file must not be tracked: {path.name}')
        name = path.relative_to(ROOT).as_posix()
        if path.suffix in ('.sh', '.service', '.timer', '.py') or path.name == 'Caddyfile':
            data = path.read_bytes().replace(b'\r\n', b'\n')
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mode = 0o755 if path.suffix in ('.sh', '.py') else 0o644
            archive.addfile(info, io.BytesIO(data))
        else:
            archive.add(path, arcname=name)
print(f'Created {args.output.name}: {args.output.stat().st_size // 1024} KiB')
