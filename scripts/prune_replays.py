# -*- coding: utf-8 -*-
"""
LƯU TRỮ LÂU DÀI VÀ DỌN DỮ LIỆU — Arena OTTV2
=================================================
An toàn archive và dọn replay cũ trên PostgreSQL.

Quy trình:
  1. Đếm và đo dung lượng bảng trước khi làm gì
  2. Export dữ liệu cũ ra file JSON (archive)
  3. XÁC NHẬN archive có thể đọc lại được
  4. CHỈ sau khi xác nhận → xóa dữ liệu cũ
  5. VACUUM ANALYZE để thu hồi dung lượng

YÊU CẦU:
  - DATABASE_URL=<PostgreSQL URL>
  - Sử dụng psql và pg_dump từ PATH

Cách chạy:
  python scripts/prune_replays.py --measure          (chỉ đo, không xóa)
  python scripts/prune_replays.py --archive-old 30   (archive > 30 ngày ra file)
  python scripts/prune_replays.py --prune 30 --confirm-delete  (xóa sau khi archive)
"""

import argparse
import datetime
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit, unquote, parse_qs

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass


def _ts() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def _log(level: str, msg: str):
    print(f"[{_ts()}] [{level}] {msg}")


def _pg_env() -> dict:
    """Parse DATABASE_URL into PostgreSQL environment variables."""
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise RuntimeError("DATABASE_URL is required")
    parsed = urlsplit(url)
    if parsed.scheme not in ("postgres", "postgresql"):
        raise RuntimeError("DATABASE_URL must be a PostgreSQL connection string")
    return {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "PGHOST": parsed.hostname,
        "PGPORT": str(parsed.port or 5432),
        "PGDATABASE": unquote(parsed.path.lstrip("/")),
        "PGUSER": unquote(parsed.username or "postgres"),
        "PGPASSWORD": unquote(parsed.password or ""),
        "PGSSLMODE": parse_qs(parsed.query).get("sslmode", ["require"])[0],
    }


def _psql(query: str, env: dict) -> str:
    """Run a psql query and return output."""
    import subprocess
    result = subprocess.run(
        ["psql", "-t", "-A", "-c", query],
        env=env, capture_output=True, text=True, timeout=60
    )
    if result.returncode != 0:
        raise RuntimeError(f"psql error: {result.stderr.strip()}")
    return result.stdout.strip()


# ─── MEASURE ───────────────────────────────────────────────────────────────

def measure_storage(env: dict) -> dict:
    """Measure database storage usage."""
    _log("INFO", "Đo dung lượng database...")

    # Total database size
    db_size = _psql("SELECT pg_size_pretty(pg_database_size(current_database()))", env)
    db_bytes = int(_psql("SELECT pg_database_size(current_database())", env))

    # Table sizes
    table_query = """
    SELECT c.relname, pg_size_pretty(pg_total_relation_size(c.oid)),
           pg_total_relation_size(c.oid),
           (SELECT count(*) FROM pg_catalog.pg_inherits WHERE inhparent = c.oid) + 
           COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = c.relname), 0)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
    """
    tables_raw = _psql(table_query, env)
    tables = []
    for line in tables_raw.splitlines():
        parts = line.split("|")
        if len(parts) >= 3:
            tables.append({
                "table": parts[0].strip(),
                "size": parts[1].strip(),
                "bytes": int(parts[2].strip()),
                "rows": int(parts[3].strip()) if len(parts) > 3 and parts[3].strip().isdigit() else 0,
            })

    # Record age distribution for qualifier records
    age_dist = {}
    try:
        age_query = """
        SELECT 
            CASE 
                WHEN (data->>'created_at')::timestamp > NOW() - INTERVAL '7 days' THEN '0-7 days'
                WHEN (data->>'created_at')::timestamp > NOW() - INTERVAL '30 days' THEN '7-30 days'
                WHEN (data->>'created_at')::timestamp > NOW() - INTERVAL '90 days' THEN '30-90 days'
                ELSE '90+ days'
            END as age_bucket,
            count(*) as count
        FROM arena_qualifier_records
        WHERE data->>'created_at' IS NOT NULL
        GROUP BY 1 ORDER BY 1
        """
        dist_raw = _psql(age_query, env)
        for line in dist_raw.splitlines():
            parts = line.split("|")
            if len(parts) >= 2:
                age_dist[parts[0].strip()] = int(parts[1].strip())
    except Exception:
        age_dist = {"note": "Cannot determine age distribution"}

    report = {
        "timestamp": _ts(),
        "database_size": db_size,
        "database_bytes": db_bytes,
        "tables": tables,
        "age_distribution": age_dist,
    }

    _log("INFO", f"  Database total: {db_size}")
    for t in tables:
        _log("INFO", f"  Table {t['table']}: {t['size']} ({t['rows']} rows)")
    if age_dist and "note" not in age_dist:
        _log("INFO", "  Age distribution:")
        for bucket, count in age_dist.items():
            _log("INFO", f"    {bucket}: {count} records")

    return report


# ─── ARCHIVE ───────────────────────────────────────────────────────────────

def archive_old_records(env: dict, retention_days: int, archive_dir: str) -> dict:
    """Export old records to JSON files before deletion."""
    _log("INFO", f"Archive records older than {retention_days} days...")

    cutoff = (datetime.datetime.now(datetime.timezone.utc) -
              datetime.timedelta(days=retention_days)).isoformat()

    # Count records to archive
    count_query = f"""
    SELECT count(*) FROM arena_qualifier_records
    WHERE data->>'created_at' IS NOT NULL
    AND (data->>'created_at')::timestamp < '{cutoff}'::timestamp
    """
    try:
        count = int(_psql(count_query, env))
    except Exception:
        _log("WARN", "Cannot count old records (column may not exist)")
        count = 0

    if count == 0:
        _log("INFO", "  Không có bản ghi nào cũ hơn {retention_days} ngày")
        return {"archived_count": 0}

    _log("INFO", f"  Tìm thấy {count} bản ghi cũ cần archive")

    # Export to JSON
    Path(archive_dir).mkdir(parents=True, exist_ok=True)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    archive_file = Path(archive_dir) / f"archive-{stamp}.jsonl"

    export_query = f"""
    COPY (
        SELECT key, data FROM arena_qualifier_records
        WHERE data->>'created_at' IS NOT NULL
        AND (data->>'created_at')::timestamp < '{cutoff}'::timestamp
    ) TO STDOUT WITH (FORMAT csv, HEADER false)
    """

    import subprocess
    result = subprocess.run(
        ["psql", "-c", export_query],
        env=env, capture_output=True, text=True, timeout=300
    )

    if result.returncode != 0:
        # Fallback: export via SELECT
        _log("WARN", "COPY TO STDOUT failed, using SELECT fallback")
        select_query = f"""
        SELECT json_build_object('key', key, 'data', data)
        FROM arena_qualifier_records
        WHERE data->>'created_at' IS NOT NULL
        AND (data->>'created_at')::timestamp < '{cutoff}'::timestamp
        """
        result = subprocess.run(
            ["psql", "-t", "-A", "-c", select_query],
            env=env, capture_output=True, text=True, timeout=300
        )
        if result.returncode != 0:
            raise RuntimeError(f"Cannot export: {result.stderr[:200]}")

    archive_file.write_text(result.stdout, encoding="utf-8")
    size_mb = archive_file.stat().st_size / (1024 * 1024)
    _log("INFO", f"  ✔ Archive exported: {archive_file.name} ({size_mb:.1f} MB)")

    # Verify archive is readable
    line_count = sum(1 for _ in archive_file.open(encoding="utf-8"))
    _log("INFO", f"  ✔ Archive verified: {line_count} lines")

    return {
        "archived_count": count,
        "archive_file": str(archive_file),
        "archive_size_mb": round(size_mb, 1),
        "line_count": line_count,
        "cutoff": cutoff,
    }


# ─── PRUNE ─────────────────────────────────────────────────────────────────

def prune_old_records(env: dict, retention_days: int) -> dict:
    """Delete archived records from the database."""
    cutoff = (datetime.datetime.now(datetime.timezone.utc) -
              datetime.timedelta(days=retention_days)).isoformat()

    _log("INFO", f"Xóa bản ghi cũ hơn {retention_days} ngày...")

    # Count before
    count_before = int(_psql("SELECT count(*) FROM arena_qualifier_records", env))

    # Delete in batches to avoid long locks
    total_deleted = 0
    batch_size = 1000
    import subprocess

    while True:
        delete_query = f"""
        DELETE FROM arena_qualifier_records
        WHERE ctid IN (
            SELECT ctid FROM arena_qualifier_records
            WHERE data->>'created_at' IS NOT NULL
            AND (data->>'created_at')::timestamp < '{cutoff}'::timestamp
            LIMIT {batch_size}
        )
        """
        result = subprocess.run(
            ["psql", "-t", "-A", "-c", delete_query],
            env=env, capture_output=True, text=True, timeout=60
        )
        if result.returncode != 0:
            raise RuntimeError(f"Delete failed: {result.stderr[:200]}")

        # Parse "DELETE N"
        deleted_str = result.stdout.strip()
        deleted = 0
        if deleted_str.startswith("DELETE"):
            try:
                deleted = int(deleted_str.split()[-1])
            except (ValueError, IndexError):
                pass

        total_deleted += deleted
        _log("INFO", f"  Deleted batch: {deleted} (total: {total_deleted})")

        if deleted < batch_size:
            break

    # VACUUM ANALYZE
    _log("INFO", "  Running VACUUM ANALYZE...")
    subprocess.run(
        ["psql", "-c", "VACUUM ANALYZE arena_qualifier_records"],
        env=env, capture_output=True, text=True, timeout=300
    )

    count_after = int(_psql("SELECT count(*) FROM arena_qualifier_records", env))

    _log("INFO", f"  ✔ Xóa hoàn tất: {count_before} → {count_after} records ({total_deleted} deleted)")

    return {
        "records_before": count_before,
        "records_after": count_after,
        "total_deleted": total_deleted,
        "cutoff": cutoff,
    }


# ─── MAIN ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Lưu trữ lâu dài và dọn replay cũ",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--measure", action="store_true",
                        help="Chỉ đo dung lượng, không xóa")
    parser.add_argument("--archive-old", type=int, metavar="DAYS",
                        help="Archive records older than N days to file")
    parser.add_argument("--prune", type=int, metavar="DAYS",
                        help="Delete records older than N days (cần --confirm-delete)")
    parser.add_argument("--confirm-delete", action="store_true",
                        help="Xác nhận xóa dữ liệu (bắt buộc khi dùng --prune)")
    parser.add_argument("--archive-dir", default="database/archives",
                        help="Thư mục lưu archive")

    args = parser.parse_args()

    if not any([args.measure, args.archive_old, args.prune]):
        parser.error("Chọn --measure, --archive-old N, hoặc --prune N")

    if args.prune and not args.confirm_delete:
        parser.error("--prune yêu cầu --confirm-delete. Hãy archive trước khi xóa!")

    if args.prune and args.prune < 7:
        parser.error("--prune phải >= 7 ngày")

    try:
        env = _pg_env()
    except RuntimeError as e:
        _log("ERROR", str(e))
        return 1

    try:
        if args.measure:
            report = measure_storage(env)
            # Save report
            report_file = Path("docs") / "storage_report.json"
            report_file.parent.mkdir(parents=True, exist_ok=True)
            report_file.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
            _log("INFO", f"✔ Report saved: {report_file}")
            return 0

        if args.archive_old:
            archive_result = archive_old_records(env, args.archive_old, args.archive_dir)
            _log("INFO", f"✔ Archive result: {json.dumps(archive_result, ensure_ascii=False)}")
            return 0

        if args.prune:
            # First archive, then prune
            _log("INFO", "Bước 1: Archive trước khi xóa")
            archive_result = archive_old_records(env, args.prune, args.archive_dir)

            if archive_result["archived_count"] == 0:
                _log("INFO", "Không có gì để xóa")
                return 0

            _log("INFO", "Bước 2: Xóa dữ liệu cũ")
            prune_result = prune_old_records(env, args.prune)

            # Save combined report
            report = {
                "timestamp": _ts(),
                "archive": archive_result,
                "prune": prune_result,
            }
            report_file = Path("docs") / "retention_report.json"
            report_file.parent.mkdir(parents=True, exist_ok=True)
            report_file.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
            _log("INFO", f"✔ Report saved: {report_file}")
            return 0

    except Exception as e:
        _log("ERROR", f"Lỗi: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
