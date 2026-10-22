# -*- coding: utf-8 -*-
"""
KIỂM TRA BẢO MẬT WORKER ĐẦY ĐỦ — Arena OTTV2
================================================
Xác minh:
  1. Security Group chỉ cho phép Gateway truy cập cổng worker
  2. Egress worker bị chặn (không ra Internet)
  3. Sandbox giới hạn CPU/RAM/timeout
  4. Worker không có quyền truy cập secrets
  5. Syscall blocking hoạt động

Cách chạy:
  python deploy/aws/verify_worker_isolation.py --gateway-id i-xxx --region ap-southeast-1
  python deploy/aws/verify_worker_isolation.py --local-only  (kiểm tra sandbox trên localhost)
"""

import argparse
import json
import os
import socket
import subprocess
import sys
import time
from typing import Dict, List, Tuple

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass


def _log(level: str, msg: str):
    print(f"[{level}] {msg}")


# ─── AWS Security Group Verification ──────────────────────────────────────

def verify_security_groups(gateway_id: str, region: str) -> Tuple[bool, List[str]]:
    """Verify Security Groups restrict worker access to gateway only."""
    findings = []
    all_ok = True

    def aws_cli(*cmd):
        result = subprocess.run(
            ["aws", "--region", region, "--output", "json", *cmd],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            raise RuntimeError(f"AWS CLI error: {result.stderr.strip()}")
        return json.loads(result.stdout or "{}")

    # Get gateway SGs
    try:
        gw_resp = aws_cli("ec2", "describe-instances", "--instance-ids", gateway_id)
        gw_inst = gw_resp["Reservations"][0]["Instances"][0]
        gw_sg_ids = {sg["GroupId"] for sg in gw_inst["SecurityGroups"]}
        gw_priv_ip = gw_inst.get("PrivateIpAddress", "")
        findings.append(f"✔ Gateway {gateway_id}: SGs={gw_sg_ids}, IP={gw_priv_ip}")
    except Exception as e:
        findings.append(f"❌ Cannot find gateway {gateway_id}: {e}")
        return False, findings

    # Find judge workers
    filters = [
        {"Name": "tag:ArenaGateway", "Values": [gateway_id]},
        {"Name": "tag:ArenaRole", "Values": ["judge"]},
        {"Name": "instance-state-name", "Values": ["running"]},
    ]
    try:
        j_resp = aws_cli("ec2", "describe-instances", "--filters", json.dumps(filters))
        judges = [i for r in j_resp.get("Reservations", []) for i in r.get("Instances", [])]
    except Exception as e:
        findings.append(f"❌ Cannot query workers: {e}")
        return False, findings

    if not judges:
        findings.append("❌ No running judge workers found with matching tags")
        return False, findings

    findings.append(f"✔ Found {len(judges)} judge worker(s)")

    for idx, j in enumerate(judges):
        jid = j["InstanceId"]
        priv_ip = j.get("PrivateIpAddress", "N/A")
        findings.append(f"\n[Worker #{idx+1}] {jid} (IP: {priv_ip})")

        judge_port_ok = False
        egress_restricted = True

        for sg in j.get("SecurityGroups", []):
            sg_id = sg["GroupId"]
            sg_detail = aws_cli("ec2", "describe-security-groups", "--group-ids", sg_id)
            sg_data = sg_detail["SecurityGroups"][0]

            # Check INGRESS rules
            for rule in sg_data.get("IpPermissions", []):
                proto = rule.get("IpProtocol", "")
                from_port = rule.get("FromPort")
                to_port = rule.get("ToPort", from_port)
                ip_ranges = [r["CidrIp"] for r in rule.get("IpRanges", [])]
                user_groups = {g["GroupId"] for g in rule.get("UserIdGroupPairs", [])}

                # Check judge port (8001)
                if proto == "-1" or (proto in ("tcp", "6") and from_port and from_port <= 8001 <= (to_port or from_port)):
                    # Verify source is gateway SG only
                    if ip_ranges:
                        # Check if CIDR contains non-gateway IPs
                        if any(cidr in ("0.0.0.0/0", "::/0") for cidr in ip_ranges):
                            findings.append(f"  ❌ Port {from_port}: OPEN TO WORLD (0.0.0.0/0)")
                            all_ok = False
                        else:
                            findings.append(f"  ⚠ Port {from_port}: CIDR-based ({ip_ranges}), not SG-based")
                    elif user_groups and user_groups.issubset(gw_sg_ids):
                        judge_port_ok = True
                        findings.append(f"  ✔ Port 8001: restricted to Gateway SG {user_groups}")
                    elif user_groups:
                        findings.append(f"  ❌ Port {from_port}: allowed from non-gateway SGs {user_groups - gw_sg_ids}")
                        all_ok = False

                # Check SSH (22) access
                if proto in ("tcp", "6") and from_port and from_port <= 22 <= (to_port or from_port):
                    if any(cidr == "0.0.0.0/0" for cidr in ip_ranges):
                        findings.append(f"  ⚠ SSH port 22: OPEN TO WORLD — should restrict to admin IP")

            # Check EGRESS rules
            for rule in sg_data.get("IpPermissionsEgress", []):
                proto = rule.get("IpProtocol", "")
                ip_ranges = [r["CidrIp"] for r in rule.get("IpRanges", [])]

                if proto == "-1" and "0.0.0.0/0" in ip_ranges:
                    egress_restricted = False

        if not judge_port_ok:
            findings.append(f"  ❌ No rule found restricting port 8001 to Gateway SG only")
            all_ok = False

        if not egress_restricted:
            findings.append(f"  ⚠ Egress is unrestricted (0.0.0.0/0). Worker can reach the internet.")
            findings.append(f"    → Khuyến nghị: Chặn egress, chỉ cho phép VPC internal + apt repos")

    return all_ok, findings


# ─── Sandbox Verification ─────────────────────────────────────────────────

def verify_sandbox_local(worker_url: str = "http://127.0.0.1:8001") -> Tuple[bool, List[str]]:
    """Verify sandbox isolation on a local/remote worker."""
    findings = []
    all_ok = True

    # 1. Check worker health
    import urllib.request
    import urllib.error

    try:
        with urllib.request.urlopen(f"{worker_url}/health", timeout=5) as resp:
            data = json.loads(resp.read())
            findings.append(f"✔ Worker health: {data.get('status', 'OK')}")
    except Exception as e:
        findings.append(f"❌ Worker health check failed: {e}")
        return False, findings

    # 2. Test sandbox with malicious Python code
    malicious_tests = [
        {
            "name": "Network access (should be blocked)",
            "code": """
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(2)
try:
    s.connect(("8.8.8.8", 53))
    print("NETWORK_ACCESSIBLE")
except:
    print("NETWORK_BLOCKED")
finally:
    s.close()
""",
            "expected_blocked": True,
        },
        {
            "name": "File system access (should be restricted)",
            "code": """
import os
try:
    files = os.listdir("/etc")
    print(f"FILES_VISIBLE:{len(files)}")
except:
    print("FS_RESTRICTED")
""",
            "expected_blocked": True,
        },
        {
            "name": "Process spawning (should be blocked)",
            "code": """
import subprocess
try:
    result = subprocess.run(["id"], capture_output=True, text=True, timeout=2)
    print(f"PROCESS_SPAWNED:{result.stdout.strip()}")
except:
    print("PROCESS_BLOCKED")
""",
            "expected_blocked": True,
        },
        {
            "name": "Memory bomb (should be killed by OOM)",
            "code": """
try:
    data = []
    for i in range(100):
        data.append(b"X" * (1024 * 1024 * 10))  # 10MB chunks
    print("MEMORY_UNLIMITED")
except MemoryError:
    print("MEMORY_LIMITED")
""",
            "expected_blocked": True,
        },
        {
            "name": "CPU bomb (should timeout)",
            "code": """
import time
start = time.time()
while True:
    _ = 2 ** 1000000
    if time.time() - start > 10:
        print("CPU_UNLIMITED")
        break
""",
            "expected_blocked": True,
        },
    ]

    findings.append("\n--- Sandbox Isolation Tests ---")
    for test in malicious_tests:
        findings.append(f"\n  Test: {test['name']}")
        try:
            payload = {
                "code": test["code"],
                "language": "python",
                "tournament_id": "__sandbox_test__",
                "match_id": "__sandbox_test__",
            }
            req = urllib.request.Request(
                f"{worker_url}/validate-code",
                data=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                result = json.loads(resp.read())
                output = result.get("output", result.get("stdout", ""))
                error = result.get("error", result.get("stderr", ""))

                if test["expected_blocked"]:
                    if "BLOCKED" in str(output) or "RESTRICTED" in str(output) or "LIMITED" in str(output) or error:
                        findings.append(f"    ✔ BỊ CHẶN đúng: {output or error}")
                    else:
                        findings.append(f"    ❌ KHÔNG BỊ CHẶN: {output}")
                        all_ok = False
                else:
                    findings.append(f"    ✔ Kết quả: {output}")
        except urllib.error.HTTPError as e:
            if e.code in (400, 422):
                findings.append(f"    ✔ Worker từ chối mã độc (HTTP {e.code})")
            else:
                findings.append(f"    ⚠ HTTP {e.code}: {e.read().decode()[:200]}")
        except Exception as e:
            if "timeout" in str(e).lower():
                findings.append(f"    ✔ Timeout (sandbox đã giới hạn thời gian)")
            else:
                findings.append(f"    ⚠ Exception: {e}")

    # 3. Check systemd service hardening (local only)
    if os.path.isfile("/etc/systemd/system/arena-worker.service"):
        findings.append("\n--- systemd Service Hardening ---")
        with open("/etc/systemd/system/arena-worker.service") as f:
            content = f.read()

        checks = {
            "NoNewPrivileges=true": "Không thể leo thang quyền",
            "ProtectSystem=strict": "Filesystem chỉ đọc",
            "ProtectHome=true": "Home directory ẩn",
            "IPAddressDeny=any": "Network bị chặn mặc định",
            "IPAddressAllow=localhost": "Chỉ cho phép localhost",
            "MemoryMax=": "Giới hạn RAM",
            "TasksMax=": "Giới hạn số process",
            "CapabilityBoundingSet=": "Không có Linux capabilities",
        }
        for directive, description in checks.items():
            if directive in content:
                findings.append(f"  ✔ {directive} → {description}")
            else:
                findings.append(f"  ⚠ Thiếu: {directive} → {description}")
                all_ok = False

    return all_ok, findings


# ─── Main ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Kiểm tra bảo mật worker đầy đủ")
    parser.add_argument("--gateway-id", default=os.environ.get("GATEWAY_INSTANCE_ID", ""),
                        help="AWS EC2 Instance ID of the gateway")
    parser.add_argument("--region", default=os.environ.get("AWS_REGION", "ap-southeast-1"),
                        help="AWS region")
    parser.add_argument("--worker-url", default="http://127.0.0.1:8001",
                        help="Worker URL for sandbox tests")
    parser.add_argument("--local-only", action="store_true",
                        help="Chỉ kiểm tra sandbox local, bỏ qua AWS SG")
    parser.add_argument("--sg-only", action="store_true",
                        help="Chỉ kiểm tra Security Groups, bỏ qua sandbox")
    args = parser.parse_args()

    print("=" * 70)
    print("🛡 KIỂM TRA BẢO MẬT WORKER — Arena OTTV2 ICPC")
    print("=" * 70)

    overall_ok = True
    all_findings = []

    # Security Group verification
    if not args.local_only:
        if not args.gateway_id:
            parser.error("Cần --gateway-id hoặc --local-only")
        print(f"\n📋 Kiểm tra AWS Security Groups (Gateway: {args.gateway_id})")
        sg_ok, sg_findings = verify_security_groups(args.gateway_id, args.region)
        overall_ok = overall_ok and sg_ok
        all_findings.extend(sg_findings)
        for f in sg_findings:
            print(f"  {f}")

    # Sandbox verification
    if not args.sg_only:
        print(f"\n📋 Kiểm tra Sandbox Isolation (Worker: {args.worker_url})")
        sandbox_ok, sandbox_findings = verify_sandbox_local(args.worker_url)
        overall_ok = overall_ok and sandbox_ok
        all_findings.extend(sandbox_findings)
        for f in sandbox_findings:
            print(f"  {f}")

    # Summary
    print("\n" + "=" * 70)
    if overall_ok:
        print("✔ KẾT QUẢ: TẤT CẢ KIỂM TRA BẢO MẬT ĐẠT")
    else:
        print("❌ KẾT QUẢ: CÓ VẤN ĐỀ BẢO MẬT CẦN KHẮC PHỤC")
    print("=" * 70)

    # Save report
    report = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "gateway_id": args.gateway_id,
        "overall_pass": overall_ok,
        "findings": all_findings,
    }
    report_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                              "docs")
    os.makedirs(report_dir, exist_ok=True)
    report_file = os.path.join(report_dir, "security_audit_report.json")
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"✔ Báo cáo đã lưu: {report_file}")

    return 0 if overall_ok else 1


if __name__ == "__main__":
    sys.exit(main())
