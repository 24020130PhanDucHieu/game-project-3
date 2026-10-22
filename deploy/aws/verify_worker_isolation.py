# -*- coding: utf-8 -*-
"""Inspect tagged AWS judge security groups for port 8001 access.

This check does not verify egress, host firewalls, sandbox isolation, or releases.
"""

import sys
import os
import json
import argparse
import subprocess
from typing import Dict, Any, List

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

def verify_worker_security_groups(gateway_id: str, region: str = "ap-southeast-1") -> bool:
    print("=" * 70)
    print("🛡 KIỂM ĐỊNH BẢO MẬT & CÔ LẬP MẠNG CHO CỤM WORKER JUDGES")
    print(f"   Gateway ID: {gateway_id} | AWS Region: {region}")
    print("=" * 70)

    def aws_cli(*cmd):
        res = subprocess.run(["aws", "--region", region, "--output", "json", *cmd], capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"Lỗi AWS CLI: {res.stderr.strip()}")
        return json.loads(res.stdout or "{}")

    # 1. Lấy thông tin Gateway
    try:
        gw_resp = aws_cli("ec2", "describe-instances", "--instance-ids", gateway_id)
        gw_inst = gw_resp["Reservations"][0]["Instances"][0]
        gw_sg_ids = {sg["GroupId"] for sg in gw_inst["SecurityGroups"]}
        print(f"✔ Đã xác định Gateway: {gateway_id} | Security Groups: {gw_sg_ids}")
    except Exception as e:
        print(f"❌ Không thể tìm thấy Gateway ID {gateway_id}: {e}")
        return False

    # 2. Tìm tất cả các Judge Worker được gắn tag
    filters = [
        {"Name": "tag:ArenaGateway", "Values": [gateway_id]},
        {"Name": "tag:ArenaRole", "Values": ["judge"]},
        {"Name": "instance-state-name", "Values": ["running", "pending"]}
    ]
    
    try:
        j_resp = aws_cli("ec2", "describe-instances", "--filters", json.dumps(filters))
        judges = [i for r in j_resp.get("Reservations", []) for i in r.get("Instances", [])]
    except Exception as e:
        print(f"❌ Lỗi truy vấn danh sách worker judges: {e}")
        return False

    if not judges:
        print("Không tìm thấy worker có tag phù hợp; không thể xác minh cách ly mạng.")
        return False

    print(f"✔ Tìm thấy {len(judges)} máy chủ Judge Worker đang hoạt động:")
    all_isolated = True

    for idx, j in enumerate(judges):
        judge_port_found = False
        jid = j["InstanceId"]
        priv_ip = j.get("PrivateIpAddress", "N/A")
        pub_ip = j.get("PublicIpAddress", "N/A")
        sg_list = j.get("SecurityGroups", [])
        print(f"\n[Worker #{idx+1}] ID: {jid} | Private IP: {priv_ip} | Public IP: {pub_ip}")

        # Kiểm tra từng Security Group gắn vào Judge
        for sg in sg_list:
            sg_id = sg["GroupId"]
            sg_details = aws_cli("ec2", "describe-security-groups", "--group-ids", sg_id)["SecurityGroups"][0]
            permissions = sg_details.get("IpPermissions", [])

            for p in permissions:
                port = p.get("FromPort")
                end_port = p.get("ToPort", port)
                protocol = p.get("IpProtocol")
                ip_ranges = [r.get("CidrIp") for r in p.get("IpRanges", [])]
                ip6_ranges = [r.get("CidrIpv6") for r in p.get("Ipv6Ranges", [])]
                prefix_lists = p.get("PrefixListIds", [])
                user_groups = {g.get("GroupId") for g in p.get("UserIdGroupPairs", [])}

                # Kiểm tra cổng chấm bài (8001 / 55440)
                if protocol == "-1" or (protocol in ("tcp", "6") and port is not None and any(port <= target <= end_port for target in (8001, 55440))):
                    if ip_ranges or ip6_ranges or prefix_lists or user_groups - gw_sg_ids:
                        print(f"  ❌ Cổng {port}-{end_port}: có nguồn ngoài Gateway SG hoặc dải CIDR; chưa an toàn.")
                        all_isolated = False
                    elif not user_groups:
                        print(f"  ❌ Cổng {port}-{end_port}: không có Gateway SG được phép.")
                        all_isolated = False
                    else:
                        # Kiểm tra xem có trỏ đúng vào Security Group của Gateway không
                        valid_sources = user_groups.intersection(gw_sg_ids)
                        if valid_sources:
                            if protocol == "-1" or port <= 8001 <= end_port:
                                judge_port_found = True
                            print(f"  ✔ Cổng {port}: ĐƯỢC BẢO VỆ CHẶT CHẼ. Chỉ nhận từ Gateway SG {valid_sources}.")
                        else:
                            print(f"  ⚠️ Cổng {port}: Nguồn truy cập ({user_groups}) không khớp với Gateway SG {gw_sg_ids}!")
                            all_isolated = False
        if not judge_port_found:
            print(f"  ❌ Không tìm thấy quy tắc TCP/8001 chỉ cho phép Gateway SG ở {jid}.")
            all_isolated = False

    print("\n" + "=" * 70)
    if all_isolated:
        print("Các Security Group tìm thấy chỉ cho phép gateway SG tới cổng judge đã kiểm tra.")
    else:
        print("🚨 KẾT LUẬN: PHÁT HIỆN SƠ HỞ BẢO MẬT MẠNG CẦN KHẮC PHỤC NGAY!")
    print("=" * 70)
    return all_isolated

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Verify Worker Security Group Network Isolation")
    parser.add_argument("--gateway-id", default=os.environ.get("GATEWAY_INSTANCE_ID", ""))
    parser.add_argument("--region", default=os.environ.get("AWS_REGION", "ap-southeast-1"))
    args = parser.parse_args()

    if not args.gateway_id:
        parser.error("Pass the real --gateway-id; local mock mode cannot verify security groups.")
    success = verify_worker_security_groups(args.gateway_id, args.region)
    sys.exit(0 if success else 1)
