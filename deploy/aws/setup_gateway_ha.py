# -*- coding: utf-8 -*-
"""
THIẾT LẬP VÀ XÁC MINH DỰ PHÒNG GATEWAY (HIGH AVAILABILITY) — AWS
===================================================================
Tạo kiến trúc Gateway HA (Dual Gateway) phía sau Application Load Balancer (ALB):
  1. Phát hiện Gateway chính (Gateway 1).
  2. Tạo/cấu hình Gateway phụ (Gateway 2) ở Availability Zone khác.
  3. Tạo AWS Application Load Balancer (ALB) hoặc cấu hình Target Group.
  4. Đăng ký cả hai Gateway vào Target Group với health check /ready (cổng 8080).
  5. Kiểm tra cân bằng tải và diễn tập chuyển mạch tự động (Failover Drill).

Cách dùng:
  # 1. Tạo hoặc kiểm tra cấu hình HA:
  python deploy/aws/setup_gateway_ha.py --primary-gateway-id i-0123456789abcdef0 --region ap-southeast-1

  # 2. Chỉ kiểm tra trạng thái sức khỏe của cụm Gateway HA:
  python deploy/aws/setup_gateway_ha.py --status-only --alb-arn arn:aws:elasticloadbalancing:...

  # 3. Chạy diễn tập chuyển đổi dự phòng (Failover Drill):
  python deploy/aws/setup_gateway_ha.py --drill-failover --alb-dns arena-alb-xxx.elb.amazonaws.com
"""

import argparse
import datetime
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.request
from typing import Dict, List, Optional, Tuple

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass


def _log(level: str, msg: str):
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S UTC")
    icons = {"INFO": "ℹ", "OK": "✔", "WARN": "⚠", "ERROR": "❌", "DRILL": "🔧"}
    print(f"[{ts}] {icons.get(level, '•')} {msg}")


def _aws(region: str, *cmd) -> dict:
    full_cmd = ["aws", "--region", region, "--output", "json", *cmd]
    res = subprocess.run(full_cmd, capture_output=True, text=True, timeout=60)
    if res.returncode != 0:
        raise RuntimeError(f"AWS CLI command failed: {res.stderr.strip() or res.stdout.strip()}")
    out = res.stdout.strip()
    return json.loads(out) if out else {}


def get_instance_details(region: str, instance_id: str) -> dict:
    resp = _aws(region, "ec2", "describe-instances", "--instance-ids", instance_id)
    reservations = resp.get("Reservations", [])
    if not reservations or not reservations[0].get("Instances"):
        raise RuntimeError(f"Instance {instance_id} not found in {region}")
    return reservations[0]["Instances"][0]


def find_alternative_subnet(region: str, vpc_id: str, exclude_subnet_id: str) -> Optional[str]:
    """Find a public/usable subnet in the same VPC but different AZ."""
    resp = _aws(region, "ec2", "describe-subnets", "--filters",
                f"Name=vpc-id,Values={vpc_id}")
    subnets = resp.get("Subnets", [])
    for sub in subnets:
        if sub["SubnetId"] != exclude_subnet_id:
            return sub["SubnetId"]
    return None


def ensure_secondary_gateway(region: str, primary: dict) -> dict:
    """Ensure a secondary gateway instance exists in another AZ."""
    vpc_id = primary["VpcId"]
    primary_subnet = primary["SubnetId"]
    primary_id = primary["InstanceId"]

    # Check for existing tagged secondary gateway
    filters = [
        {"Name": "tag:ArenaRole", "Values": ["gateway-secondary"]},
        {"Name": "tag:ArenaPrimaryGateway", "Values": [primary_id]},
        {"Name": "instance-state-name", "Values": ["pending", "running", "stopped"]},
    ]
    resp = _aws(region, "ec2", "describe-instances", "--filters", json.dumps(filters))
    instances = [i for r in resp.get("Reservations", []) for i in r.get("Instances", [])]

    if instances:
        sec = instances[0]
        _log("INFO", f"Tìm thấy Gateway dự phòng hiện hữu: {sec['InstanceId']} ({sec['State']['Name']})")
        if sec["State"]["Name"] == "stopped":
            _log("INFO", f"Khởi động lại Gateway dự phòng {sec['InstanceId']}...")
            _aws(region, "ec2", "start-instances", "--instance-ids", sec["InstanceId"])
            _aws(region, "ec2", "wait", "instance-running", "--instance-ids", sec["InstanceId"])
            sec = get_instance_details(region, sec["InstanceId"])
        return sec

    _log("INFO", "Chưa có Gateway dự phòng. Đang tạo Gateway phụ (Secondary Gateway)...")
    sec_subnet = find_alternative_subnet(region, vpc_id, primary_subnet)
    if not sec_subnet:
        _log("WARN", "Không tìm thấy Subnet ở AZ khác trong VPC. Dùng lại Subnet chính.")
        sec_subnet = primary_subnet

    sg_ids = [sg["GroupId"] for sg in primary.get("SecurityGroups", [])]
    tags = [
        {"Key": "Name", "Value": "arena-gateway-secondary"},
        {"Key": "ArenaRole", "Value": "gateway-secondary"},
        {"Key": "ArenaPrimaryGateway", "Value": primary_id},
    ]

    token = hashlib.sha256(f"arena-gw2-{primary_id}".encode()).hexdigest()[:32]
    launch_args = [
        "ec2", "run-instances",
        "--image-id", primary["ImageId"],
        "--instance-type", primary["InstanceType"],
        "--count", "1",
        "--client-token", token,
        "--credit-specification", "CpuCredits=standard",
        "--network-interfaces", json.dumps([{
            "DeviceIndex": 0,
            "SubnetId": sec_subnet,
            "Groups": sg_ids,
            "AssociatePublicIpAddress": True,
            "DeleteOnTermination": True
        }]),
        "--block-device-mappings", json.dumps([{
            "DeviceName": primary.get("RootDeviceName", "/dev/xvda"),
            "Ebs": {"VolumeSize": 16, "VolumeType": "gp3", "Encrypted": True, "DeleteOnTermination": True}
        }]),
        "--tag-specifications", json.dumps([{"ResourceType": "instance", "Tags": tags}])
    ]
    if primary.get("KeyName"):
        launch_args.extend(["--key-name", primary["KeyName"]])

    run_res = _aws(region, *launch_args)
    new_inst = run_res["Instances"][0]
    new_id = new_inst["InstanceId"]
    _log("INFO", f"Đã gửi lệnh tạo instance {new_id}, chờ khởi động...")
    _aws(region, "ec2", "wait", "instance-running", "--instance-ids", new_id)
    sec_details = get_instance_details(region, new_id)
    _log("OK", f"Gateway dự phòng đã chạy: {new_id} (IP: {sec_details.get('PublicIpAddress')})")
    return sec_details


def setup_alb_for_gateways(region: str, primary: dict, secondary: dict) -> dict:
    """Setup AWS Application Load Balancer and Target Group for dual gateways."""
    vpc_id = primary["VpcId"]
    subnets = list({primary["SubnetId"], secondary["SubnetId"]})

    # If both are in the same subnet, ALB requires at least two subnets in different AZs
    if len(subnets) < 2:
        alt_sub = find_alternative_subnet(region, vpc_id, subnets[0])
        if alt_sub:
            subnets.append(alt_sub)
        else:
            raise RuntimeError("ALB yêu cầu tối thiểu 2 Subnet ở 2 Availability Zone khác nhau.")

    sg_ids = [sg["GroupId"] for sg in primary.get("SecurityGroups", [])]

    # 1. Create Target Group
    tg_name = f"arena-gw-tg-{primary['InstanceId'][-8:]}"
    _log("INFO", f"Đảm bảo Target Group {tg_name}...")
    try:
        tg_resp = _aws(region, "elbv2", "describe-target-groups", "--names", tg_name)
        tg_arn = tg_resp["TargetGroups"][0]["TargetGroupArn"]
        _log("INFO", f"Target Group hiện hữu: {tg_arn}")
    except Exception:
        tg_resp = _aws(region, "elbv2", "create-target-group",
                       "--name", tg_name,
                       "--protocol", "HTTP",
                       "--port", "8080",
                       "--vpc-id", vpc_id,
                       "--target-type", "instance",
                       "--health-check-protocol", "HTTP",
                       "--health-check-path", "/ready",
                       "--health-check-interval-seconds", "15",
                       "--health-check-timeout-seconds", "5",
                       "--healthy-threshold-count", "2",
                       "--unhealthy-threshold-count", "2")
        tg_arn = tg_resp["TargetGroups"][0]["TargetGroupArn"]
        _log("OK", f"Đã tạo Target Group: {tg_arn}")

    # 2. Register Targets (Primary + Secondary)
    targets = [{"Id": primary["InstanceId"], "Port": 8080},
               {"Id": secondary["InstanceId"], "Port": 8080}]
    _log("INFO", f"Đăng ký {len(targets)} Gateways vào Target Group...")
    _aws(region, "elbv2", "register-targets", "--target-group-arn", tg_arn,
         "--targets", json.dumps(targets))
    _log("OK", "Đã đăng ký cả 2 Gateway vào Target Group")

    # 3. Create or describe ALB
    alb_name = f"arena-alb-{primary['InstanceId'][-8:]}"
    _log("INFO", f"Đảm bảo ALB {alb_name}...")
    try:
        alb_resp = _aws(region, "elbv2", "describe-load-balancers", "--names", alb_name)
        alb = alb_resp["LoadBalancers"][0]
        alb_arn = alb["LoadBalancerArn"]
        alb_dns = alb["DNSName"]
        _log("INFO", f"ALB hiện hữu: {alb_dns}")
    except Exception:
        alb_resp = _aws(region, "elbv2", "create-load-balancer",
                        "--name", alb_name,
                        "--subnets", *subnets,
                        "--security-groups", *sg_ids,
                        "--scheme", "internet-facing",
                        "--type", "application",
                        "--ip-address-type", "ipv4")
        alb = alb_resp["LoadBalancers"][0]
        alb_arn = alb["LoadBalancerArn"]
        alb_dns = alb["DNSName"]
        _log("OK", f"Đã tạo ALB mới: {alb_dns}")

    # 4. Create Listener on port 80 forwarding to Target Group
    try:
        list_resp = _aws(region, "elbv2", "describe-listeners", "--load-balancer-arn", alb_arn)
        listeners = list_resp.get("Listeners", [])
        if not listeners:
            _log("INFO", "Tạo Listener HTTP:80 chuyển tiếp tới Target Group...")
            _aws(region, "elbv2", "create-listener",
                 "--load-balancer-arn", alb_arn,
                 "--protocol", "HTTP",
                 "--port", "80",
                 "--default-actions", json.dumps([{"Type": "forward", "TargetGroupArn": tg_arn}]))
            _log("OK", "Listener HTTP:80 đã được tạo")
        else:
            _log("INFO", f"Listener HTTP:{listeners[0]['Port']} đã tồn tại")
    except Exception as e:
        _log("WARN", f"Lỗi cấu hình listener: {e}")

    return {
        "alb_arn": alb_arn,
        "alb_dns": alb_dns,
        "target_group_arn": tg_arn,
        "primary_id": primary["InstanceId"],
        "secondary_id": secondary["InstanceId"],
    }


def verify_target_health(region: str, tg_arn: str) -> Dict[str, str]:
    """Inspect target health state in target group."""
    resp = _aws(region, "elbv2", "describe-target-health", "--target-group-arn", tg_arn)
    health = {}
    for desc in resp.get("TargetHealthDescriptions", []):
        tid = desc["Target"]["Id"]
        state = desc["TargetHealth"]["State"]
        reason = desc["TargetHealth"].get("Reason", "")
        health[tid] = f"{state} ({reason})" if reason else state
    return health


def run_failover_drill(alb_dns: str, max_probes: int = 20) -> dict:
    """Send requests through ALB and measure response and availability."""
    _log("DRILL", f"Bắt đầu diễn tập kiểm tra lưu lượng qua ALB: http://{alb_dns}/ready")
    url = f"http://{alb_dns}/ready"
    success_count = 0
    failures = 0
    latencies = []

    for i in range(max_probes):
        t0 = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ArenaHA-Drill/1.0"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                status = resp.status
                body = resp.read()
                lat = (time.time() - t0) * 1000
                latencies.append(lat)
                if status == 200:
                    success_count += 1
                else:
                    failures += 1
        except Exception as e:
            failures += 1
        time.sleep(0.5)

    avg_lat = sum(latencies) / len(latencies) if latencies else 0.0
    _log("OK", f"Kết quả kiểm tra ALB: {success_count}/{max_probes} thành công (avg latency: {avg_lat:.1f}ms)")
    return {
        "alb_url": url,
        "probes": max_probes,
        "success": success_count,
        "failures": failures,
        "avg_latency_ms": round(avg_lat, 2),
        "status": "PASS" if failures == 0 else "DEGRADED"
    }


def main():
    parser = argparse.ArgumentParser(description="Thiết lập và xác minh dự phòng Gateway HA")
    parser.add_argument("--primary-gateway-id", help="Instance ID của Gateway chính (i-...)")
    parser.add_argument("--region", default="ap-southeast-1", help="AWS Region (default: ap-southeast-1)")
    parser.add_argument("--status-only", action="store_true", help="Chỉ kiểm tra sức khỏe của ALB Target Group")
    parser.add_argument("--target-group-arn", help="Target Group ARN để kiểm tra")
    parser.add_argument("--drill-failover", action="store_true", help="Chạy kiểm thử kết nối liên tục qua ALB")
    parser.add_argument("--alb-dns", help="DNS name của ALB")
    args = parser.parse_args()

    if args.drill_failover:
        if not args.alb_dns:
            sys.exit("Cần --alb-dns để chạy drill-failover.")
        res = run_failover_drill(args.alb_dns)
        print(json.dumps(res, indent=2, ensure_ascii=False))
        return

    if args.status_only:
        if not args.target_group_arn:
            sys.exit("Cần --target-group-arn để kiểm tra trạng thái.")
        health = verify_target_health(args.region, args.target_group_arn)
        print("Trạng thái Target Health:")
        for tid, state in health.items():
            print(f"  • {tid}: {state}")
        return

    if not args.primary_gateway_id:
        sys.exit("Cần --primary-gateway-id (ví dụ: i-0123456789abcdef0)")

    _log("INFO", f"=== Thiết lập Gateway HA cho Gateway {args.primary_gateway_id} ===")
    primary = get_instance_details(args.region, args.primary_gateway_id)
    _log("OK", f"Gateway chính: {primary['InstanceId']} | VPC: {primary['VpcId']} | Subnet: {primary['SubnetId']}")

    secondary = ensure_secondary_gateway(args.region, primary)
    alb_info = setup_alb_for_gateways(args.region, primary, secondary)

    _log("INFO", "Kiểm tra Target Health ban đầu...")
    time.sleep(3)
    health = verify_target_health(args.region, alb_info["target_group_arn"])
    for tid, state in health.items():
        _log("INFO", f"Target {tid}: {state}")

    report_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                               "aws", "gateway_ha_config.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(alb_info, f, indent=2, ensure_ascii=False)

    _log("OK", f"Cấu hình HA hoàn tất! Đã lưu tại: {report_path}")
    print("\n" + "=" * 70)
    print("  KẾT QUẢ THIẾT LẬP GATEWAY DỰ PHÒNG (HA)")
    print("=" * 70)
    print(f"  • Gateway 1 (Primary):    {alb_info['primary_id']}")
    print(f"  • Gateway 2 (Secondary):  {alb_info['secondary_id']}")
    print(f"  • Load Balancer DNS:      {alb_info['alb_dns']}")
    print(f"  • Target Group ARN:       {alb_info['target_group_arn']}")
    print(f"  • Health Check Path:      /ready (port 8080)")
    print("=" * 70)


if __name__ == "__main__":
    main()
