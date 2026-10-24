"""Create a consistent PostgreSQL archive; never print connection credentials."""
import datetime
import hashlib
import os
from pathlib import Path
import subprocess
from urllib.parse import urlparse, unquote, parse_qs


def offsite_copy(archive: Path):
    """Mã hóa bản sao lưu rồi chép sang máy khác (mặc định máy chấm 2 trong VPC), giữ 7 bản mới nhất.

    BACKUP_OFFSITE_TARGET=ubuntu@172.31.44.150:/var/backups/arena-offsite
    BACKUP_OFFSITE_KEY=/etc/arena/offsite_ed25519   (khóa SSH chỉ dùng cho việc này)
    BACKUP_OFFSITE_KNOWN_HOSTS=/etc/arena/offsite_known_hosts
    BACKUP_ENCRYPTION_KEY=<chuỗi bí mật dài>          (bắt buộc: không gửi bản chưa mã hóa ra ngoài)
    """
    target = os.environ.get("BACKUP_OFFSITE_TARGET", "").strip()
    secret = os.environ.get("BACKUP_ENCRYPTION_KEY", "")
    if not target:
        return False
    if len(secret) < 16:
        print("Offsite copy skipped: BACKUP_ENCRYPTION_KEY must be at least 16 characters")
        return False
    host, _, remote_dir = target.partition(":")
    key = os.environ.get("BACKUP_OFFSITE_KEY", "/etc/arena/offsite_ed25519")
    known = os.environ.get("BACKUP_OFFSITE_KNOWN_HOSTS", "/etc/arena/offsite_known_hosts")
    ssh_opts = ["-i", key, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
                "-o", f"UserKnownHostsFile={known}", "-o", "ConnectTimeout=15"]
    encrypted = archive.with_name(archive.name + ".enc")
    try:
        result = subprocess.run(["openssl", "enc", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-salt",
                                 "-in", str(archive), "-out", str(encrypted), "-pass", "env:BACKUP_ENCRYPTION_KEY"],
                                env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "BACKUP_ENCRYPTION_KEY": secret},
                                capture_output=True, timeout=600)
        if result.returncode:
            print("Offsite copy failed: encryption error")
            return False
        result = subprocess.run(["scp", "-q", *ssh_opts, str(encrypted), str(archive.with_suffix(".sha256")),
                                 f"{host}:{remote_dir}/"], capture_output=True, text=True, timeout=1800)
        if result.returncode:
            print("Offsite copy failed:", result.stderr.strip()[:200])
            return False
        # Giữ 7 bản mã hóa mới nhất trên máy nhận.
        prune = f"cd {remote_dir} && ls -1t *.dump.enc 2>/dev/null | tail -n +8 | while read f; do rm -f \"$f\" \"${{f%.dump.enc}}.sha256\"; done"
        subprocess.run(["ssh", *ssh_opts, host, prune], capture_output=True, timeout=120)
        print(f"Encrypted offsite copy stored on {host}:{remote_dir}/{encrypted.name}")
        return True
    finally:
        encrypted.unlink(missing_ok=True)


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
        elif not offsite_copy(archive):
            print("Restore drill and encrypted off-host copy remain required. (Set BACKUP_OFFSITE_TARGET or S3_BACKUP_BUCKET)")
    finally:
        partial.unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # Suppress subprocess command/environment details and connection strings.
        print("Backup failed:", type(exc).__name__, exc)
        raise SystemExit(1)
