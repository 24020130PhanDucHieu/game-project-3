# -*- coding: utf-8 -*-
"""
DIỄN TẬP SAO LƯU VÀ KHÔI PHỤC — PostgreSQL
=============================================
Quy trình đầy đủ:
  1. Tạo bản sao lưu pg_dump từ Supabase
  2. Xác minh checksum SHA-256
  3. Kiểm tra catalog (pg_restore --list)
  4. KHÔI PHỤC THẬT vào database staging tách biệt
  5. Đối soát record count giữa production và bản khôi phục
  6. Sao lưu offsite lên S3 (nếu có AWS CLI)
  7. Xuất báo cáo kết quả

YÊU CẦU:
  - DATABASE_URL=<production Supabase URL>
  - RESTORE_DATABASE_URL=<staging database URL> (database khác, KHÔNG PHẢI production!)
  - pg_dump, pg_restore, psql phải có trong PATH
  - S3_BACKUP_BUCKET (tùy chọn, để sao lưu offsite)

Cách chạy:
  python scripts/postgres_backup_restore_drill.py --full-drill
  python scripts/postgres_backup_restore_drill.py --backup-only
  python scripts/postgres_backup_restore_drill.py --offsite-only --archive <path.dump>
"""

import argparse
import datetime
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlsplit, unquote, parse_qs

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass


def _log(level: str, msg: str):
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"[{ts}] [{level}] {msg}")


def _digest(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def _parse_pg_url(url: str) -> dict:
    """Parse a PostgreSQL connection URL into environment variables."""
    parsed = urlsplit(url)
    if parsed.scheme not in ("postgres", "postgresql") or not parsed.hostname:
        raise RuntimeError(f"Invalid PostgreSQL URL (scheme={parsed.scheme})")
    env = {
        "PGHOST": parsed.hostname,
        "PGPORT": str(parsed.port or 5432),
        "PGDATABASE": unquote(parsed.path.lstrip("/")),
        "PGUSER": unquote(parsed.username or "postgres"),
        "PGPASSWORD": unquote(parsed.password or ""),
        "PGSSLMODE": parse_qs(parsed.query).get("sslmode", ["require"])[0],
        "PGCONNECT_TIMEOUT": "30",
    }
    return env


def _run_pg(cmd: list, env: dict, timeout: int = 1800, capture: bool = False) -> subprocess.CompletedResult:
    """Run a PostgreSQL command with connection environment."""
    full_env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin")}
    full_env.update(env)
    return subprocess.run(
        cmd, env=full_env, capture_output=capture, text=capture,
        timeout=timeout
    )


def _count_records(pg_env: dict, table: str = "arena_qualifier_records") -> int:
    """Count records in a table."""
    result = _run_pg(
        ["psql", "-t", "-A", "-c", f"SELECT COUNT(*) FROM {table}"],
        pg_env, timeout=30, capture=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"Cannot count records: {result.stderr.strip()}")
    return int(result.stdout.strip())


# ─── BACKUP ────────────────────────────────────────────────────────────────

def do_backup(backup_dir: str) -> Path:
    """Create a consistent PostgreSQL backup with checksum."""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required. Set it to the Supabase connection string.")

    _log("INFO", "Bắt đầu tạo bản sao lưu PostgreSQL...")
    pg_env = _parse_pg_url(database_url)
    _log("INFO", f"  Host: {pg_env['PGHOST']}:{pg_env['PGPORT']}")
    _log("INFO", f"  Database: {pg_env['PGDATABASE']}")

    # Pre-flight: verify connection
    pre = _run_pg(["psql", "-c", "SELECT 1"], pg_env, timeout=15, capture=True)
    if pre.returncode != 0:
        raise RuntimeError(f"Cannot connect to PostgreSQL: {pre.stderr.strip()}")
    _log("INFO", "  ✔ Kết nối database thành công")

    # Count records before backup
    prod_count = _count_records(pg_env)
    _log("INFO", f"  ✔ Số bản ghi hiện tại: {prod_count}")

    # Create backup directory
    backup_path = Path(backup_dir)
    backup_path.mkdir(parents=True, exist_ok=True)

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    archive = backup_path / f"arena-{stamp}.dump"
    partial = backup_path / f"arena-{stamp}.partial"

    try:
        _log("INFO", "  Đang dump database (pg_dump --format=custom)...")
        result = _run_pg(
            ["pg_dump", "--format=custom", "--no-owner", "--no-acl",
             "--file", str(partial)],
            pg_env, timeout=1800
        )
        if result.returncode != 0:
            raise RuntimeError("pg_dump failed")

        size_mb = partial.stat().st_size / (1024 * 1024)
        _log("INFO", f"  ✔ Dump hoàn thành: {size_mb:.1f} MB")

        # Verify catalog
        _log("INFO", "  Kiểm tra catalog (pg_restore --list)...")
        cat = _run_pg(["pg_restore", "--list", str(partial)], pg_env, timeout=60, capture=True)
        if cat.returncode != 0:
            raise RuntimeError(f"Archive catalog invalid: {cat.stderr.strip()}")
        table_count = sum(1 for line in cat.stdout.splitlines() if "TABLE DATA" in line)
        _log("INFO", f"  ✔ Catalog hợp lệ: {table_count} bảng dữ liệu")

        # Compute checksum
        digest = _digest(partial)
        partial.replace(archive)
        checksum_file = archive.with_suffix(".sha256")
        checksum_file.write_text(f"{digest}  {archive.name}\n", encoding="ascii")
        _log("INFO", f"  ✔ Checksum SHA-256: {digest[:16]}...")

        # Create metadata file
        metadata = {
            "timestamp": stamp,
            "source_host": pg_env["PGHOST"],
            "source_database": pg_env["PGDATABASE"],
            "archive_file": archive.name,
            "size_bytes": archive.stat().st_size,
            "sha256": digest,
            "record_count": prod_count,
            "table_count": table_count,
        }
        meta_file = archive.with_suffix(".meta.json")
        meta_file.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")

        _log("INFO", f"✔ Sao lưu thành công: {archive}")
        return archive

    except Exception:
        partial.unlink(missing_ok=True)
        raise


# ─── RESTORE DRILL ─────────────────────────────────────────────────────────

def do_restore_drill(archive: Path) -> dict:
    """Restore an archive to a staging database and verify data integrity."""
    restore_url = os.environ.get("RESTORE_DATABASE_URL")
    if not restore_url:
        raise RuntimeError(
            "RESTORE_DATABASE_URL is required. Set it to a STAGING database URL.\n"
            "This must be a SEPARATE database from production!"
        )

    # Safety check: restore URL must differ from production URL
    prod_url = os.environ.get("DATABASE_URL", "")
    prod_parsed = urlsplit(prod_url)
    rest_parsed = urlsplit(restore_url)
    if (prod_parsed.hostname == rest_parsed.hostname and
        unquote(prod_parsed.path.lstrip("/")) == unquote(rest_parsed.path.lstrip("/"))):
        raise RuntimeError(
            "RESTORE_DATABASE_URL points to the same database as DATABASE_URL!\n"
            "Create a separate staging database for the restore drill."
        )

    _log("INFO", "Bắt đầu diễn tập khôi phục (RESTORE DRILL)...")

    # Verify archive integrity
    _log("INFO", f"  Archive: {archive.name}")
    checksum_file = archive.with_suffix(".sha256")
    if checksum_file.is_file():
        expected = checksum_file.read_text(encoding="ascii").split()[0]
        actual = _digest(archive)
        if expected != actual:
            raise RuntimeError(f"Checksum mismatch! Expected {expected[:16]}... got {actual[:16]}...")
        _log("INFO", "  ✔ Checksum SHA-256 khớp")
    else:
        _log("WARN", "  ⚠ Không tìm thấy file checksum, bỏ qua xác minh")

    # Parse restore target
    pg_env = _parse_pg_url(restore_url)
    _log("INFO", f"  Restore target: {pg_env['PGHOST']}:{pg_env['PGPORT']}/{pg_env['PGDATABASE']}")

    # Get original record count from metadata
    meta_file = archive.with_suffix(".meta.json")
    original_count = None
    if meta_file.is_file():
        meta = json.loads(meta_file.read_text(encoding="utf-8"))
        original_count = meta.get("record_count")

    # Restore
    _log("INFO", "  Đang restore (pg_restore --clean --if-exists)...")
    result = _run_pg(
        ["pg_restore", "--clean", "--if-exists", "--no-owner", "--no-acl",
         "--dbname", pg_env["PGDATABASE"],
         "--host", pg_env["PGHOST"],
         "--port", pg_env["PGPORT"],
         "--username", pg_env["PGUSER"],
         str(archive)],
        pg_env, timeout=1800, capture=True
    )

    # pg_restore may return non-zero for warnings (e.g., "table doesn't exist" for --clean)
    if result.returncode != 0 and result.stderr:
        # Filter out harmless warnings
        serious_errors = [
            line for line in result.stderr.splitlines()
            if "ERROR" in line and "does not exist" not in line
        ]
        if serious_errors:
            _log("ERROR", f"  Restore errors: {'; '.join(serious_errors[:3])}")
            raise RuntimeError("pg_restore encountered serious errors")

    _log("INFO", "  ✔ Restore hoàn thành")

    # Verify data integrity
    _log("INFO", "  Đối soát dữ liệu...")
    try:
        restored_count = _count_records(pg_env)
        _log("INFO", f"  ✔ Số bản ghi sau restore: {restored_count}")

        if original_count is not None:
            if restored_count == original_count:
                _log("INFO", f"  ✔ ĐỐI SOÁT CHÍNH XÁC: {restored_count} = {original_count}")
            else:
                _log("WARN", f"  ⚠ CHÊNH LỆCH: restored={restored_count}, original={original_count}")
    except Exception as e:
        _log("WARN", f"  ⚠ Không đối soát được: {e}")
        restored_count = -1

    drill_result = {
        "archive": archive.name,
        "restore_target": f"{pg_env['PGHOST']}:{pg_env['PGPORT']}/{pg_env['PGDATABASE']}",
        "original_count": original_count,
        "restored_count": restored_count,
        "match": original_count == restored_count if original_count is not None else None,
        "status": "PASS" if (original_count is not None and original_count == restored_count) else "NEEDS_REVIEW",
    }

    _log("INFO", f"✔ Kết quả drill: {drill_result['status']}")
    return drill_result


# ─── OFFSITE S3 ────────────────────────────────────────────────────────────

def do_offsite_s3(archive: Path) -> dict:
    """Copy archive to S3 for offsite backup."""
    bucket = os.environ.get("S3_BACKUP_BUCKET")
    if not bucket:
        raise RuntimeError("S3_BACKUP_BUCKET is required (e.g., s3://my-arena-backups)")

    if not shutil.which("aws"):
        raise RuntimeError("AWS CLI (aws) not found in PATH")

    _log("INFO", "Sao lưu offsite lên S3...")
    _log("INFO", f"  Archive: {archive.name}")
    _log("INFO", f"  Bucket: {bucket}")

    s3_key = f"{bucket.rstrip('/')}/arena-db/{archive.name}"

    # Upload archive
    result = subprocess.run(
        ["aws", "s3", "cp", str(archive), s3_key,
         "--storage-class", "STANDARD_IA",
         "--metadata", f"sha256={_digest(archive)}"],
        capture_output=True, text=True, timeout=3600,
    )
    if result.returncode != 0:
        raise RuntimeError(f"S3 upload failed: {result.stderr.strip()}")
    _log("INFO", f"  ✔ Upload thành công: {s3_key}")

    # Upload checksum
    checksum_file = archive.with_suffix(".sha256")
    if checksum_file.is_file():
        result = subprocess.run(
            ["aws", "s3", "cp", str(checksum_file), f"{s3_key}.sha256"],
            capture_output=True, text=True, timeout=60,
        )
    # Upload metadata
    meta_file = archive.with_suffix(".meta.json")
    if meta_file.is_file():
        result = subprocess.run(
            ["aws", "s3", "cp", str(meta_file), f"{s3_key}.meta.json"],
            capture_output=True, text=True, timeout=60,
        )

    _log("INFO", "✔ Sao lưu offsite hoàn thành")
    return {"s3_key": s3_key, "status": "OK"}


# ─── RETENTION CLEANUP ────────────────────────────────────────────────────

def cleanup_old_backups(backup_dir: str, keep_count: int = 7):
    """Keep only the N newest backups, delete older ones."""
    backup_path = Path(backup_dir)
    dumps = sorted(backup_path.glob("arena-*.dump"), key=lambda p: p.stat().st_mtime, reverse=True)

    if len(dumps) <= keep_count:
        _log("INFO", f"Giữ nguyên {len(dumps)} bản backup (tối đa {keep_count})")
        return

    to_delete = dumps[keep_count:]
    for dump in to_delete:
        _log("INFO", f"  Xóa backup cũ: {dump.name}")
        dump.unlink(missing_ok=True)
        dump.with_suffix(".sha256").unlink(missing_ok=True)
        dump.with_suffix(".meta.json").unlink(missing_ok=True)
    _log("INFO", f"✔ Đã dọn {len(to_delete)} bản backup cũ")


# ─── MAIN ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Diễn tập sao lưu và khôi phục PostgreSQL",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument("--full-drill", action="store_true",
                        help="Backup + Restore vào staging + Đối soát + Offsite S3")
    parser.add_argument("--backup-only", action="store_true",
                        help="Chỉ tạo bản sao lưu, không restore")
    parser.add_argument("--restore-only", action="store_true",
                        help="Khôi phục từ archive vào RESTORE_DATABASE_URL")
    parser.add_argument("--offsite-only", action="store_true",
                        help="Chỉ sao lưu offsite lên S3")
    parser.add_argument("--cleanup", action="store_true",
                        help="Dọn backup cũ (giữ --keep-count bản mới nhất)")
    parser.add_argument("--archive", type=str,
                        help="Đường dẫn file archive (.dump) cho --restore-only hoặc --offsite-only")
    parser.add_argument("--directory", default="database/backups",
                        help="Thư mục lưu backup (mặc định: database/backups)")
    parser.add_argument("--keep-count", type=int, default=7,
                        help="Số bản backup giữ lại khi --cleanup")

    args = parser.parse_args()

    # Validate arguments
    modes = [args.full_drill, args.backup_only, args.restore_only, args.offsite_only, args.cleanup]
    if sum(modes) != 1:
        parser.error("Chọn đúng một chế độ: --full-drill, --backup-only, --restore-only, --offsite-only, hoặc --cleanup")

    if (args.restore_only or args.offsite_only) and not args.archive:
        parser.error("--restore-only và --offsite-only yêu cầu --archive <path.dump>")

    report = {"timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(), "steps": []}

    try:
        if args.cleanup:
            cleanup_old_backups(args.directory, args.keep_count)
            return 0

        if args.full_drill or args.backup_only:
            archive = do_backup(args.directory)
            report["steps"].append({"action": "backup", "archive": str(archive), "status": "OK"})
        else:
            archive = Path(args.archive)
            if not archive.is_file():
                raise RuntimeError(f"Archive not found: {archive}")

        if args.full_drill or args.restore_only:
            drill_result = do_restore_drill(archive)
            report["steps"].append({"action": "restore_drill", **drill_result})

        if args.full_drill or args.offsite_only:
            try:
                s3_result = do_offsite_s3(archive)
                report["steps"].append({"action": "offsite_s3", **s3_result})
            except RuntimeError as e:
                _log("WARN", f"  ⚠ Offsite S3 bị bỏ qua: {e}")
                report["steps"].append({"action": "offsite_s3", "status": "SKIPPED", "reason": str(e)})

        # Save report
        report_file = Path(args.directory) / "drill_report.json"
        report_file.parent.mkdir(parents=True, exist_ok=True)
        report_file.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        _log("INFO", f"✔ Báo cáo đã lưu: {report_file}")

        # Print summary
        print("\n" + "=" * 60)
        print("  KẾT QUẢ DIỄN TẬP SAO LƯU VÀ KHÔI PHỤC")
        print("=" * 60)
        for step in report["steps"]:
            status = step.get("status", "?")
            icon = "✔" if status in ("OK", "PASS") else "⚠" if status == "SKIPPED" else "❌"
            print(f"  {icon} {step['action']}: {status}")
        print("=" * 60)

        return 0

    except Exception as e:
        _log("ERROR", f"Lỗi: {e}")
        report["steps"].append({"action": "error", "message": str(e)})
        return 1


if __name__ == "__main__":
    sys.exit(main())
