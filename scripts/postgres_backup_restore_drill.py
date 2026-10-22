"""Create or inspect a PostgreSQL archive. Inspection is not a restore drill."""

import argparse
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from urllib.parse import parse_qs, unquote, urlsplit


def digest(path):
    sha = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def inspect(path):
    path = Path(path)
    if not path.is_file() or not path.stat().st_size:
        raise RuntimeError("Archive missing or empty")
    checksum = path.with_suffix(".sha256")
    expected = checksum.read_text(encoding="ascii").split() if checksum.is_file() else []
    if not expected or expected[0] != digest(path):
        raise RuntimeError("Archive checksum missing or mismatched")
    subprocess.run(["pg_restore", "--list", str(path)], check=True, stdout=subprocess.DEVNULL)
    print(f"Archive inspected: {path.name}. This is NOT a restore drill.")


def backup(directory):
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required; refusing a fake database backup")
    parsed = urlsplit(database_url)
    if parsed.scheme not in ("postgres", "postgresql") or not parsed.hostname or not parsed.path:
        raise RuntimeError("DATABASE_URL is not a PostgreSQL connection URL")
    connection_env = os.environ.copy()
    connection_env.update({"PGHOST": parsed.hostname, "PGDATABASE": unquote(parsed.path.lstrip("/"))})
    if parsed.port:
        connection_env["PGPORT"] = str(parsed.port)
    if parsed.username:
        connection_env["PGUSER"] = unquote(parsed.username)
    if parsed.password:
        connection_env["PGPASSWORD"] = unquote(parsed.password)
    options = parse_qs(parsed.query)
    connection_env["PGSSLMODE"] = options.get("sslmode", ["require"])[-1]
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix="arena-", suffix=".dump", dir=directory)
    os.close(fd)
    archive = Path(name)
    try:
        # libpq connection variables keep credentials out of argv.
        with archive.open("wb") as output:
            subprocess.run(["pg_dump", "--format=custom", "--no-owner", "--no-acl"], check=True, stdout=output, env=connection_env)
        archive.with_suffix(".sha256").write_text(digest(archive) + "  " + archive.name + "\n", encoding="ascii")
        inspect(archive)
        return archive
    except Exception:
        archive.unlink(missing_ok=True)
        archive.with_suffix(".sha256").unlink(missing_ok=True)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup", action="store_true")
    parser.add_argument("--drill", action="store_true", help="Inspect archive only; never restores")
    parser.add_argument("--archive", help="Archive for --drill")
    parser.add_argument("--directory", default="database/backups")
    args = parser.parse_args()
    if args.backup == args.drill:
        parser.error("Choose exactly one of --backup and --drill")
    if args.drill and not args.archive:
        parser.error("--drill requires --archive; no live database is modified")
    try:
        inspect(args.archive) if args.drill else backup(args.directory)
    except (OSError, RuntimeError, subprocess.CalledProcessError) as exc:
        print(f"Backup inspection failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
