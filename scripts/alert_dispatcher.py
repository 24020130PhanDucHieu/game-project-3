# -*- coding: utf-8 -*-
"""
HỆ THỐNG PHÁT CẢNH BÁO CHỦ ĐỘNG (PROACTIVE ALERT DISPATCHER)
Kiểm tra sức khỏe hệ thống theo chu kỳ: CPU, RAM, Ổ đĩa, Gateway, Supabase,
Worker Heartbeat, Hàng đợi nộp bài (Backlog), và Tuổi bản sao lưu (Backup Age).
Gửi cảnh báo tức thì qua Webhook (Telegram, Discord, Slack) đến người trực giải.
"""

import os
import sys
import time
import json
import glob
import shutil
import argparse
from typing import Dict, Any, List

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

try:
    import requests
except ImportError:
    print("Vui lòng cài đặt requests: pip install requests")
    sys.exit(1)

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:8080")
WEBHOOK_URL = os.environ.get("ALERT_WEBHOOK_URL", "") # Hỗ trợ Discord, Slack, Telegram Bot
ONCALL_CONTACT = os.environ.get("ONCALL_CONTACT", "@kythuat-arena")

def check_system_resources() -> List[Dict[str, Any]]:
    alerts = []
    
    # 1. Kiểm tra ổ đĩa
    try:
        usage = shutil.disk_usage(".")
        free_pct = (usage.free / usage.total) * 100.0
        if free_pct < 15.0:
            alerts.append({
                "severity": "CRITICAL",
                "title": "Dung lượng đĩa phân vùng gốc sắp hết!",
                "message": f"Dung lượng trống chỉ còn {free_pct:.1f}% ({usage.free // (1024**3)} GB còn lại)."
            })
    except Exception as e:
        pass

    # 2. Kiểm tra CPU & RAM
    if HAS_PSUTIL:
        try:
            cpu = psutil.cpu_percent(interval=1.0)
            if cpu > 85.0:
                alerts.append({
                    "severity": "WARNING",
                    "title": "CPU máy chủ vượt ngưỡng an toàn!",
                    "message": f"Tải CPU hiện tại đang ở mức {cpu:.1f}% (>85%)."
                })

            mem = psutil.virtual_memory()
            if mem.percent > 85.0:
                alerts.append({
                    "severity": "WARNING",
                    "title": "Bộ nhớ RAM sắp cạn kiệt!",
                    "message": f"Mức tiêu thụ RAM đạt {mem.percent:.1f}% (>85%). Khả dụng: {mem.available // (1024**2)} MB."
                })
        except Exception:
            pass

    return alerts

def check_backup_freshness() -> List[Dict[str, Any]]:
    alerts = []
    project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    backup_dir = os.path.join(project_dir, "database", "backups")
    
    if not os.path.exists(backup_dir):
        alerts.append({
            "severity": "WARNING",
            "title": "Thư mục sao lưu database chưa tồn tại!",
            "message": f"Không tìm thấy thư mục {backup_dir}. Chưa có bản backup nào được lập."
        })
        return alerts

    backup_files = glob.glob(os.path.join(backup_dir, "*.*"))
    if not backup_files:
        alerts.append({
            "severity": "WARNING",
            "title": "Chưa có bản sao lưu cơ sở dữ liệu!",
            "message": "Không tìm thấy file backup nào trong thư mục database/backups."
        })
        return alerts

    newest_file = max(backup_files, key=os.path.getmtime)
    age_seconds = time.time() - os.path.getmtime(newest_file)
    age_hours = age_seconds / 3600.0

    if age_hours > 24.0:
        alerts.append({
            "severity": "WARNING",
            "title": "Bản sao lưu cơ sở dữ liệu quá cũ!",
            "message": f"Bản backup gần nhất ({os.path.basename(newest_file)}) đã cách đây {age_hours:.1f} giờ (>24h)."
        })

    return alerts

def check_gateway_and_workers() -> List[Dict[str, Any]]:
    alerts = []
    
    # 1. Health check
    try:
        resp = requests.get(f"{BASE_URL}/health", timeout=3)
        if resp.status_code != 200:
            alerts.append({
                "severity": "CRITICAL",
                "title": "Gateway API trả về trạng thái bất thường!",
                "message": f"Endpoint /health trả về HTTP {resp.status_code}: {resp.text[:100]}"
            })
    except Exception as e:
        alerts.append({
            "severity": "CRITICAL",
            "title": "Không thể kết nối đến Gateway API!",
            "message": f"Kết nối tới {BASE_URL}/health thất bại: {e}"
        })
        return alerts

    # 2. Đăng nhập admin lấy thông tin monitoring
    admin_token = os.environ.get("ADMIN_TOKEN", "")
    if not admin_token:
        try:
            r = requests.post(f"{BASE_URL}/api/admin/login", json={"password": os.environ.get("ADMIN_PASSWORD", "admin123")}, timeout=3)
            if r.status_code == 200:
                admin_token = r.json().get("token", "")
        except Exception:
            pass

    if admin_token:
        try:
            m_resp = requests.get(f"{BASE_URL}/api/admin/monitoring", headers={"Authorization": f"Bearer {admin_token}"}, timeout=3)
            if m_resp.status_code == 200:
                data = m_resp.json()
                
                # Kiểm tra trạng thái Database
                db_status = data.get("database", {}).get("status", "UNKNOWN")
                if db_status not in ("READY", "OK"):
                    alerts.append({
                        "severity": "CRITICAL",
                        "title": "Cơ sở dữ liệu (PostgreSQL/Supabase) gặp sự cố!",
                        "message": f"Database status = {db_status}. Kết nối hoặc pool đang bị nghẽn."
                    })

                # Kiểm tra Worker Heartbeat & Release
                workers = data.get("workers", [])
                for idx, w in enumerate(workers):
                    w_host = w.get("host", f"worker-{idx+1}")
                    w_status = w.get("status", "UNKNOWN")
                    if w_status != "READY":
                        alerts.append({
                            "severity": "CRITICAL",
                            "title": f"Judge Worker {w_host} không khả dụng!",
                            "message": f"Trạng thái worker: {w_status}. Không thể chấm bài."
                        })
                    if w.get("release_mismatch"):
                        alerts.append({
                            "severity": "CRITICAL",
                            "title": f"Lệch phiên bản mã nguồn trên Worker {w_host}!",
                            "message": f"Worker đang chạy bản phát hành khác với Gateway ({w.get('release_tag')})."
                        })

                # Kiểm tra hàng đợi nộp bài vòng loại
                q_backlog = data.get("qualifier_queue", {}).get("queued_count", 0)
                if q_backlog > 50:
                    alerts.append({
                        "severity": "WARNING",
                        "title": "Hàng đợi nộp bài vòng loại đang bị nghẽn!",
                        "message": f"Số lượng bài đang xếp hàng chờ chấm là {q_backlog} bài (>50)."
                    })
        except Exception as e:
            alerts.append({
                "severity": "WARNING",
                "title": "Không thể lấy thông số monitoring quản trị",
                "message": str(e)
            })

    return alerts

def dispatch_alerts(alerts: List[Dict[str, Any]]):
    if not alerts:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] ✅ TẤT CẢ CHỈ SỐ VẬN HÀNH BÌNH THƯỜNG. Không có cảnh báo.")
        return

    print(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] 🚨 PHÁT HIỆN {len(alerts)} CẢNH BÁO HỆ THỐNG:")
    for a in alerts:
        print(f"  • [{a['severity']}] {a['title']} - {a['message']}")

    if not WEBHOOK_URL:
        print("  ℹ (Chưa cấu hình ALERT_WEBHOOK_URL để đẩy tin nhắn qua Discord/Telegram/Slack)")
        return

    # Định dạng tin nhắn gửi Webhook
    payload = {
        "content": f"🚨 **CẢNH BÁO VẬN HÀNH ĐẤU TRƯỜNG ARENA OTTV2** - Trực ban: {ONCALL_CONTACT}",
        "embeds": [
            {
                "title": a["title"],
                "description": a["message"],
                "color": 15158332 if a["severity"] == "CRITICAL" else 15844367,
                "footer": {"text": f"Mức độ: {a['severity']} | Thời gian: {time.strftime('%H:%M:%S %d/%m/%Y')}"}
            }
            for a in alerts
        ]
    }

    try:
        r = requests.post(WEBHOOK_URL, json=payload, timeout=5)
        if r.status_code in (200, 204):
            print("  ✔ Đã gửi cảnh báo thành công tới Webhook giám sát.")
        else:
            print(f"  ❌ Gửi Webhook thất bại: HTTP {r.status_code}")
    except Exception as e:
        print(f"  ❌ Lỗi khi gửi Webhook: {e}")

def run_monitor(check_once: bool = False, interval: int = 30):
    print("=" * 70)
    print("🛡 KHỞI ĐỘNG HỆ THỐNG GIÁM SÁT CHỦ ĐỘNG (PROACTIVE ALERT DISPATCHER)")
    print(f"   Target Gateway: {BASE_URL}")
    print(f"   Chu kỳ quét: {interval} giây | Trực ban phụ trách: {ONCALL_CONTACT}")
    print("=" * 70)

    while True:
        all_alerts = []
        all_alerts.extend(check_system_resources())
        all_alerts.extend(check_backup_freshness())
        all_alerts.extend(check_gateway_and_workers())
        
        dispatch_alerts(all_alerts)

        if check_once:
            break
        time.sleep(interval)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Arena Proactive Alert Dispatcher")
    parser.add_argument("--check-once", action="store_true", help="Chỉ kiểm tra 1 lần rồi thoát")
    parser.add_argument("--interval", type=int, default=30, help="Chu kỳ kiểm tra tính bằng giây")
    args = parser.parse_args()
    
    run_monitor(check_once=args.check_once, interval=args.interval)
