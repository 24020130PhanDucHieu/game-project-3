"""Create a consistent PostgreSQL archive; never print connection credentials."""
import datetime
import hashlib
import os
from pathlib import Path
import subprocess
from urllib.parse import urlparse, unquote, parse_qs


def main():
    os.umask(0o077)
    url = urlparse(os.environ.get("DATABASE_URL", ""))
    if url.scheme not in ("postgres", "postgresql") or not url.hostname:
        raise RuntimeError("DATABASE_URL must be configured for the backup service")
    target = Path("/var/backups/arena")
    target.mkdir(mode=0o700, parents=True, exist_ok=True)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    archive = target / (stamp + ".dump")
    partial = target / (stamp + ".partial")
    env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"),
           "PGHOST": url.hostname, "PGPORT": str(url.port or 5432),
           "PGUSER": unquote(url.username or ""), "PGPASSWORD": unquote(url.password or ""),
           "PGDATABASE": unquote(url.path.lstrip("/")),
           "PGSSLMODE": parse_qs(url.query).get("sslmode", ["require"])[0],
           "PGCONNECT_TIMEOUT": "15"}
    try:
        # Dump the entire database in one consistent snapshot, including future tables.
        result = subprocess.run(["pg_dump", "--format=custom", "--no-owner",
                                 "--file", str(partial)], env=env,
                                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=1800)
        if result.returncode:
            raise RuntimeError(f"pg_dump failed (code {result.returncode}): {result.stderr.decode(errors='replace')}")
        result = subprocess.run(["pg_restore", "--list", str(partial)],
                                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=60)
        if result.returncode:
            raise RuntimeError("Archive catalog verification failed")
        with partial.open("rb") as handle:
            digest = hashlib.file_digest(handle, "sha256").hexdigest()
            os.fsync(handle.fileno())
        partial.replace(archive)
        with archive.with_suffix(".sha256").open("w", encoding="ascii") as checksum:
            checksum.write(digest + "  " + archive.name + "\n")
            checksum.flush()
            os.fsync(checksum.fileno())
        directory_fd = os.open(target, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
        print("Backup created and archive catalog verified:", archive.name)
        s3_bucket = os.environ.get("S3_BACKUP_BUCKET", "").strip()
        if s3_bucket:
            if not s3_bucket.startswith("s3://"):
                s3_bucket = f"s3://{s3_bucket}"
            s3_dest = f"{s3_bucket.rstrip('/')}/arena-db/{archive.name}"
            s3_sum_dest = f"{s3_bucket.rstrip('/')}/arena-db/{archive.name}.sha256"
            try:
                cp_res = subprocess.run(["aws", "s3", "cp", str(archive), s3_dest,
                                         "--storage-class", "STANDARD_IA"],
                                        capture_output=True, text=True, timeout=1800)
                if cp_res.returncode == 0:
                    subprocess.run(["aws", "s3", "cp", str(archive.with_suffix(".sha256")), s3_sum_dest],
                                   capture_output=True, text=True, timeout=60)
                    print(f"Offsite backup synced to S3: {s3_dest}")
                else:
                    print("Offsite S3 sync failed:", cp_res.stderr.strip()[:200])
            except Exception as e:
                print("Offsite S3 sync exception:", str(e)[:200])
        else:
            print("Restore drill and encrypted off-host copy remain required. (Set S3_BACKUP_BUCKET to automate offsite sync)")
    finally:
        partial.unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # Suppress subprocess command/environment details and connection strings.
        print("Backup failed:", type(exc).__name__, exc)
        raise SystemExit(1)
