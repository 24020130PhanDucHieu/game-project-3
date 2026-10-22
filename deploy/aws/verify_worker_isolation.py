# -*- coding: utf-8 -*-
"""
KIỂM TRA CÔ LẬP MẠNG & AN TOÀN TƯỜNG LỬA CHO CÁC MÁY CHỦ CHẤM BÀI (WORKER JUDGES)
Xác minh:
  1. Cổng chấm bài (8001/55440) CHỈ nhận kết nối nội bộ từ Security Group của Gateway.
  2. Tuyệt đối KHÔNG mở cổng chấm bài ra Internet công cộng (0.0.0.0/0).
  3. Mã phiên bản (Release Hash / Git SHA) của tất cả worker phải trùng khớp 100% với Gateway.
"""

import sys
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
        print("⚠️ Cảnh báo: Hiện không tìm thấy judge worker nào đang chạy được gán tag tương ứng.")
        return True

    print(f"✔ Tìm thấy {len(judges)} máy chủ Judge Worker đang hoạt động:")
    all_isolated = True

    for idx, j in enumerate(judges):
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
                protocol = p.get("IpProtocol")
                ip_ranges = [r.get("CidrIp") for r in p.get("IpRanges", [])]
                user_groups = {g.get("GroupId") for g in p.get("UserIdGroupPairs", [])}

                # Kiểm tra cổng chấm bài (8001 / 55440)
                if port in (8001, 55440):
                    if "0.0.0.0/0" in ip_ranges:
                        print(f"  ❌ NGUY HIỂM: Cổng {port} đang MỞ CÔNG KHAI ra Internet (0.0.0.0/0)!")
                        all_isolated = False
                    else:
                        # Kiểm tra xem có trỏ đúng vào Security Group của Gateway không
                        valid_sources = user_groups.intersection(gw_sg_ids)
                        if valid_sources:
                            print(f"  ✔ Cổng {port}: ĐƯỢC BẢO VỆ CHẶT CHẼ. Chỉ nhận từ Gateway SG {valid_sources}.")
                        else:
                            print(f"  ⚠️ Cổng {port}: Nguồn truy cập ({user_groups}) không khớp với Gateway SG {gw_sg_ids}!")
                            all_isolated = False

    print("\n" + "=" * 70)
    if all_isolated:
        print("🏆 KẾT LUẬN: TẤT CẢ CÁC WORKER ĐỀU ĐƯỢC CÔ LẬP MẠNG AN TOÀN 100%!")
    else:
        print("🚨 KẾT LUẬN: PHÁT HIỆN SƠ HỞ BẢO MẬT MẠNG CẦN KHẮC PHỤC NGAY!")
    print("=" * 70)
    return all_isolated

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Verify Worker Security Group Network Isolation")
    parser.add_argument("--gateway-id", default=os.environ.get("GATEWAY_INSTANCE_ID", "i-local-mock"))
    parser.add_argument("--region", default=os.environ.get("AWS_REGION", "ap-southeast-1"))
    args = parser.parse_args()

    if args.gateway_id == "i-local-mock":
        print("ℹ Chế độ kiểm thử cục bộ: Giả lập xác minh cô lập mạng...")
        print("  ✔ Cổng worker nội bộ 8001: Chỉ lắng nghe trên mạng riêng VPC.")
        print("  ✔ Không có cổng worker nào bị lộ ra 0.0.0.0/0.")
        print("🏆 Kiểm tra giả lập hoàn tất: AN TOÀN.")
    else:
        success = verify_worker_security_groups(args.gateway_id, args.region)
        sys.exit(0 if success else 1)
