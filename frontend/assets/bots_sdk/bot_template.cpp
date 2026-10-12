/**
 * Bot Mẫu Oẳn Tù Tì V2 (OTTV2) - Ngôn ngữ C++ (Giao tiếp STDIN/STDOUT)
 * Dành cho Tân sinh viên K69 tham gia Giải đấu Lập trình BOT ARENA
 * 
 * Biên dịch: g++ -O3 -std=c++17 bot_template.cpp -o bot
 * Giao tiếp: Đọc dữ liệu bàn đấu từ STDIN (cin), in nước đi ra STDOUT (cout).
 * Nước đi hợp lệ: "ROCK", "PAPER", "SCISSORS".
 */

#include <iostream>
#include <string>
#include <vector>
#include <map>
#include <random>

int main() {
    // Tối ưu hóa I/O cho bot thi đấu
    std::ios_base::sync_with_stdio(false);
    std::cin.tie(NULL);

    std::string state_line;
    // Đọc trạng thái ván đấu gửi từ trọng tài Sandbox
    if (std::getline(std::cin, state_line)) {
        // Tân sinh viên có thể tự do lập trình thuật toán giải mã và ra quyết định ở đây
        // Ví dụ: bot ngẫu nhiên hoặc phân tích chuỗi ký tự nhận được
        
        std::vector<std::string> valid_moves = {"ROCK", "PAPER", "SCISSORS"};
        
        // Xuất nước đi được chọn ra stdout kèm ký tự xuống dòng
        std::cout << valid_moves[0] << std::endl;
    } else {
        // Fallback an toàn phòng khi không nhận được dữ liệu
        std::cout << "ROCK" << std::endl;
    }

    return 0;
}
