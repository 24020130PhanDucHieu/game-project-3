<!-- title: Luật bổ sung theo vòng; link: guide/rules; nguon: guide.tsx, frontend/lib/format.ts (ruleBits), bot-runner/app/engine/board_rules.py, board.py -->

## Luật bổ sung hoạt động thế nào
Ban tổ chức có thể bật độc lập từng luật bổ sung cho từng vòng; không bật luật nào nghĩa là luật chuẩn. Có 5 luật bổ sung: Trộn quân, Đảo tương khắc, Sương mù, Ô bí ẩn, Chướng ngại ngẫu nhiên. Luật cụ thể của từng vòng trong một giải được công bố ở mục Luật đã công bố; trước giờ công bố, luật của vòng đó chưa được tiết lộ. Đổi luật trước khi vòng bắt đầu sẽ yêu cầu các đội nộp lại bot.

## Trộn quân
Số lượng và vị trí quân được xáo ngẫu nhiên, hai bên đối xứng. Tổng vẫn là 9 quân nhưng đừng giả định luôn có 3 quân mỗi loại: hãy đọc remaining_cards trong game_state.

## Đảo tương khắc
Quan hệ khắc bị đảo: Búa thắng Bao, Bao thắng Kéo, Kéo thắng Búa. Bot nhận cờ reverse_rule bằng true khi luật này đang bật.

## Sương mù
Bot không thấy loại quân của đối thủ (hiện dấu ?). Trong history cũng không có nước đi của đối thủ.

## Ô bí ẩn
Một số ô đặc biệt trên bàn kích hoạt hiệu ứng khi quân bước vào, và có thêm một quân Joker. Khi luật này bật mỗi bên có 3 Búa, 3 Bao, 2 Kéo và 1 Joker. Các ô đặc biệt gồm: Ô Tiến Hóa ở giữa bàn (4,4): quân bước vào tiến hóa theo vòng Kéo thành Búa, Búa thành Bao, Bao thành Kéo. Hai cặp Cổng Dịch Chuyển đối xứng: bước vào một cổng thì quân nhảy sang cổng đối ứng. Bốn Bẫy mìn ẩn đối xứng: quân dẫm phải bẫy bị loại (nếu có quân địch ở ô đó thì quân địch cũng bị loại) và bẫy biến mất. Vị trí cổng và bẫy sinh ngẫu nhiên theo từng trận nhưng công bằng cho hai đội.

## Quân Joker
Joker thắng mọi quân; Joker gặp Joker thì hòa. Joker chỉ đi được tối đa 5 bước, sau đó đứng yên. Bot chọn JOKER khi muốn đi quân Joker.

## Chướng ngại ngẫu nhiên
Mỗi trận sinh ngẫu nhiên các khối đá đối xứng qua tâm bàn (2 cặp, tổng 4 khối). Không quân nào đi vào hay xuyên qua được khối đá. Danh sách ô chướng ngại có trong game_state.obstacles.

## Gộp nhiều luật
Ban tổ chức có thể bật nhiều luật cùng lúc trong một vòng (ví dụ Sương mù cùng Chướng ngại ngẫu nhiên).
