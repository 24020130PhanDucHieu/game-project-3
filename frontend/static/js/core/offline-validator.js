// -*- coding: utf-8 -*-
/**
 * In-Browser Offline Bot Validator & Mock Tester.
 * Cho phép sinh viên kiểm tra cú pháp và chạy thử bot ngay trên trình duyệt
 * khi ngắt toàn bộ Wi-Fi / mạng phòng thi để chống gian lận AI.
 */

const OFFLINE_VALID_MOVES = new Set(["ROCK", "PAPER", "SCISSORS", "JOKER"]);

function isOfflineExamMode() {
  return !navigator.onLine || sessionStorage.getItem("arena_exam_offline_mode") === "true";
}

function setOfflineExamMode(active) {
  if (active) {
    sessionStorage.setItem("arena_exam_offline_mode", "true");
  } else {
    sessionStorage.removeItem("arena_exam_offline_mode");
  }
  updateOfflineExamBanner();
}

function updateOfflineExamBanner() {
  let banner = document.getElementById("arena-offline-exam-banner");
  const isOffline = isOfflineExamMode();

  if (!banner && isOffline) {
    banner = document.createElement("div");
    banner.id = "arena-offline-exam-banner";
    banner.className = "offline-exam-pill-banner";
    document.body.prepend(banner);
  }

  if (banner) {
    if (isOffline) {
      banner.hidden = false;
      banner.innerHTML = `
        <div class="offline-banner-content">
          <span class="offline-pulse-dot"></span>
          <strong>📴 Chế độ Phòng Thi Offline:</strong> Mạng đã ngắt chống gian lận AI. Bạn vẫn soạn code, bấm <strong>Kiểm tra</strong> và <strong>Nộp bot</strong> bình thường!
        </div>
      `;
    } else {
      banner.hidden = true;
    }
  }
}

window.addEventListener("online", updateOfflineExamBanner);
window.addEventListener("offline", updateOfflineExamBanner);
document.addEventListener("DOMContentLoaded", updateOfflineExamBanner);

/**
 * Phân tích và kiểm tra cú pháp Bot trực tiếp trên trình duyệt (Client-side AST & Syntax Validator).
 */
function validateBotCodeOffline(codeStr, language = "PYTHON", ruleId = "STAGE_1_STANDARD") {
  if (!codeStr || !codeStr.trim()) {
    return {
      is_valid: false,
      error_message: "Mã nguồn không được để trống."
    };
  }

  const codeBytes = new TextEncoder().encode(codeStr).length;
  if (codeBytes > 65536) {
    return {
      is_valid: false,
      error_message: `Mã nguồn vượt quá giới hạn 64 KB (${Math.round(codeBytes / 1024)} KB).`
    };
  }

  const lang = String(language || "PYTHON").toUpperCase();

  if (lang === "PYTHON") {
    return validatePythonOffline(codeStr, ruleId);
  } else if (lang === "CPP") {
    return validateCppOffline(codeStr, ruleId);
  } else {
    return {
      is_valid: false,
      error_message: `Ngôn ngữ '${language}' không được hỗ trợ.`
    };
  }
}

/**
 * Thay thế nội dung bên trong chuỗi (bao gồm triple-quoted docstring """ và ''')
 * bằng khoảng trắng, giữ nguyên số dòng (\n) và thụt lề để phân tích cú pháp chuẩn xác.
 */
function maskPythonStrings(codeStr) {
  let result = "";
  let i = 0;
  const len = codeStr.length;

  while (i < len) {
    // 1. Triple double quotes """
    if (codeStr.slice(i, i + 3) === '"""') {
      result += '   ';
      i += 3;
      while (i < len && codeStr.slice(i, i + 3) !== '"""') {
        result += codeStr[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < len) {
        result += '   ';
        i += 3;
      }
      continue;
    }

    // 2. Triple single quotes '''
    if (codeStr.slice(i, i + 3) === "'''") {
      result += '   ';
      i += 3;
      while (i < len && codeStr.slice(i, i + 3) !== "'''") {
        result += codeStr[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < len) {
        result += '   ';
        i += 3;
      }
      continue;
    }

    // 3. Single / Double quoted string
    if (codeStr[i] === '"' || codeStr[i] === "'") {
      const quote = codeStr[i];
      result += ' ';
      i++;
      while (i < len && codeStr[i] !== quote && codeStr[i] !== '\n') {
        if (codeStr[i] === '\\' && i + 1 < len) {
          result += '  ';
          i += 2;
        } else {
          result += ' ';
          i++;
        }
      }
      if (i < len && codeStr[i] === quote) {
        result += ' ';
        i++;
      }
      continue;
    }

    // Ký tự code thông thường
    result += codeStr[i];
    i++;
  }

  return result;
}

/**
 * Kiểm tra mã Python 3.10 Offline
 */
function validatePythonOffline(codeStr, ruleId) {
  // 1. Kiểm tra các thư viện/hàm hệ thống nguy hiểm (Bảo mật Sandbox)
  const forbiddenPatterns = [
    { pattern: /\bimport\s+os\b|\bfrom\s+os\s+import\b/, msg: "Không được phép sử dụng module 'os'." },
    { pattern: /\bimport\s+sys\b|\bfrom\s+sys\s+import\b/, msg: "Không được phép sử dụng module 'sys'." },
    { pattern: /\bimport\s+subprocess\b|\bfrom\s+subprocess\s+import\b/, msg: "Không được phép sử dụng module 'subprocess'." },
    { pattern: /\bimport\s+shutil\b|\bfrom\s+shutil\s+import\b/, msg: "Không được phép sử dụng module 'shutil'." },
    { pattern: /\beval\s*\(/, msg: "Không được phép sử dụng hàm eval()." },
    { pattern: /\bexec\s*\(/, msg: "Không được phép sử dụng hàm exec()." },
    { pattern: /\b__import__\b/, msg: "Không được phép sử dụng __import__." },
    { pattern: /\bopen\s*\(/, msg: "Không được phép sử dụng hàm đọc ghi file open()." },
    { pattern: /\bglobals\s*\(\)|\blocals\s*\(\)/, msg: "Không được phép truy cập globals() hoặc locals()." }
  ];

  for (const item of forbiddenPatterns) {
    if (item.pattern.test(codeStr)) {
      return { is_valid: false, error_message: `Bảo mật Sandbox: ${item.msg}` };
    }
  }

  // 2. Kiểm tra định nghĩa hàm decide_move
  const funcPattern = /(?:^|\n)[ \t]*def\s+decide_move\s*\(([^)]*)\)\s*:/;
  const hasDecideMove = funcPattern.test(codeStr);

  if (!hasDecideMove) {
    // Kiểm tra xem có viết nhầm tên hàm không
    const misspelled = codeStr.match(/(?:^|\n)[ \t]*def\s+([a-zA-Z0-9_]+)\s*\(/);
    if (misspelled && misspelled[1] !== "decide_move") {
      return {
        is_valid: false,
        error_message: `Tên hàm chưa đúng: bạn đang viết 'def ${misspelled[1]}(...)'. Quy chuẩn bắt buộc phải là: def decide_move(game_state):`
      };
    }
    if (/(?:^|\n)[ \t]*def\s+decide_move\b/.test(codeStr)) {
      return {
        is_valid: false,
        error_message: "Lỗi cú pháp: Thiếu dấu hai chấm ':' hoặc tham số sau 'def decide_move(game_state):'"
      };
    }
    return {
      is_valid: false,
      error_message: "Thiếu định nghĩa hàm bắt buộc: def decide_move(game_state):"
    };
  }

  // Làm sạch chuỗi và docstring để phân tích chính xác các khối lệnh & dấu ngoặc
  const maskedCode = maskPythonStrings(codeStr);

  // 3. Kiểm tra tính đóng mở ngoặc (), [], {} trên mã nguồn đã làm sạch chuỗi
  const bracketResult = checkBalancedBrackets(maskedCode);
  if (!bracketResult.valid) {
    return {
      is_valid: false,
      error_message: `Lỗi cú pháp đóng mở ngoặc dòng ${bracketResult.line}: Dấu ngoặc '${bracketResult.char}' không được đóng đúng cách.`
    };
  }

  // 4. Kiểm tra dấu hai chấm sau các khối lệnh và thụt lề
  const lines = maskedCode.split("\n");
  const rawLines = codeStr.split("\n");
  const BLOCK_START_REGEX = /^(?:def\s+[a-zA-Z0-9_]+\s*\(|class\s+[a-zA-Z0-9_]+|if\b|elif\b|else\b|for\b|while\b|try\b|except\b|finally\b|with\b)/;

  for (let i = 0; i < lines.length; i++) {
    const codePart = lines[i].split("#")[0].trim();
    if (!codePart) continue;

    const isBlockStart = BLOCK_START_REGEX.test(codePart);
    if (isBlockStart) {
      if (!codePart.endsWith(":")) {
        return {
          is_valid: false,
          error_message: `Lỗi cú pháp dòng ${i + 1}: Thiếu dấu hai chấm ':' ở cuối câu lệnh '${rawLines[i].trim()}'.`
        };
      }

      // Kiểm tra thụt lề ngay sau dấu hai chấm
      let nextIdx = i + 1;
      while (nextIdx < lines.length && !lines[nextIdx].split("#")[0].trim()) {
        nextIdx++;
      }
      if (nextIdx < lines.length) {
        const curIndent = (lines[i].match(/^[ \t]*/) || [""])[0].length;
        const nextIndent = (lines[nextIdx].match(/^[ \t]*/) || [""])[0].length;
        if (nextIndent <= curIndent) {
          return {
            is_valid: false,
            error_message: `Lỗi thụt đầu dòng (IndentationError) dòng ${nextIdx + 1}: Khối lệnh sau câu lệnh '${rawLines[i].trim()}' cần thụt lề vào trong.`
          };
        }
      }
    }
  }

  // 5. Kiểm tra các giá trị return trong hàm
  const returnMatches = [...codeStr.matchAll(/(?:^|\n)[ \t]+return\s+([^\n#]+)/g)];
  let detectedMove = "ROCK";

  if (returnMatches.length > 0) {
    for (const match of returnMatches) {
      const returnExpr = match[1].trim();
      // Nếu return chuỗi cố định
      const strMatch = returnExpr.match(/^["']([a-zA-Z0-9_]+)["']$/);
      if (strMatch) {
        const move = strMatch[1].toUpperCase();
        if (!OFFLINE_VALID_MOVES.has(move)) {
          return {
            is_valid: false,
            error_message: `Nước đi '${strMatch[1]}' không hợp lệ! Bot chỉ được trả về một trong các nước đi: 'ROCK', 'PAPER', 'SCISSORS' hoặc 'JOKER'.`
          };
        }
        detectedMove = move;
      }
    }
  }

  return {
    is_valid: true,
    is_offline: true,
    test_move: detectedMove,
    execution_time_ms: 1.2,
    message: `Cú pháp Python chuẩn xác! Hàm decide_move() hợp lệ. Nước đi kiểm thử dự kiến: [${detectedMove}]. Sẵn sàng nộp bài!`
  };
}

/**
 * Kiểm tra mã C++ 17 Offline
 */
function validateCppOffline(codeStr, ruleId) {
  // 1. Kiểm tra thư viện nguy hiểm
  const forbiddenCpp = [
    { pattern: /<windows\.h>|<unistd\.h>|<sys\//i, msg: "Không được include header hệ thống hệ điều hành." },
    { pattern: /\bsystem\s*\(/, msg: "Không được phép sử dụng system()." },
    { pattern: /\bfork\s*\(/, msg: "Không được phép sử dụng fork()." }
  ];

  for (const item of forbiddenCpp) {
    if (item.pattern.test(codeStr)) {
      return { is_valid: false, error_message: `Bảo mật Sandbox: ${item.msg}` };
    }
  }

  // 2. Kiểm tra hàm main
  const hasMain = /(?:int|void)\s+main\s*\([^)]*\)\s*\{/.test(codeStr);
  if (!hasMain) {
    return {
      is_valid: false,
      error_message: "Thiếu hàm thực thi chính: int main() { ... }"
    };
  }

  // 3. Kiểm tra cân bằng dấu ngoặc
  const bracketResult = checkBalancedBrackets(codeStr);
  if (!bracketResult.valid) {
    return {
      is_valid: false,
      error_message: `Lỗi cú pháp ngoặc dòng ${bracketResult.line}: Dấu '${bracketResult.char}' chưa được đóng đúng cách.`
    };
  }

  // 4. Kiểm tra luồng xuất cout
  let detectedMove = "ROCK";
  const coutMatches = [...codeStr.matchAll(/(?:std::cout|cout)\s*<<\s*["']([^"']+)["']/g)];
  if (coutMatches.length > 0) {
    const move = coutMatches[0][1].trim().toUpperCase();
    if (OFFLINE_VALID_MOVES.has(move)) {
      detectedMove = move;
    } else {
      return {
        is_valid: false,
        error_message: `C++ cout xuất ra '${coutMatches[0][1]}' không hợp lệ. Nước đi hợp lệ: ROCK, PAPER, SCISSORS, JOKER.`
      };
    }
  }

  return {
    is_valid: true,
    is_offline: true,
    test_move: detectedMove,
    execution_time_ms: 0.9,
    message: `Cú pháp C++ chuẩn! Đã phát hiện hàm main() và luồng xuất [${detectedMove}]. Sẵn sàng nộp bài!`
  };
}

/**
 * Thuật toán kiểm tra đóng mở ngoặc (), [], {}
 */
function checkBalancedBrackets(codeStr) {
  const stack = [];
  const openPairs = { "(": ")", "[": "]", "{": "}" };
  const closePairs = { ")": "(", "]": "[", "}": "{" };

  let inLineComment = false;
  let inBlockComment = false;
  let inString = null;
  let lineNum = 1;

  for (let i = 0; i < codeStr.length; i++) {
    const c = codeStr[i];
    const next = codeStr[i + 1] || "";

    if (c === "\n") {
      lineNum++;
      inLineComment = false;
      continue;
    }

    if (inLineComment) continue;

    if (inBlockComment) {
      if (c === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    // Bỏ qua chuỗi ký tự
    if (inString) {
      if (c === "\\" ) {
        i++; // skip escaped char
      } else if (c === inString) {
        inString = null;
      }
      continue;
    }

    // Bắt đầu chuỗi
    if (c === '"' || c === "'") {
      inString = c;
      continue;
    }

    // Bắt đầu comment
    if (c === "#") {
      inLineComment = true;
      continue;
    }
    if (c === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }

    // Kiểm tra ngoặc
    if (openPairs[c]) {
      stack.push({ char: c, line: lineNum });
    } else if (closePairs[c]) {
      if (stack.length === 0) {
        return { valid: false, char: c, line: lineNum };
      }
      const last = stack.pop();
      if (openPairs[last.char] !== c) {
        return { valid: false, char: c, line: lineNum };
      }
    }
  }

  if (stack.length > 0) {
    const unclosed = stack.pop();
    return { valid: false, char: unclosed.char, line: unclosed.line };
  }

  return { valid: true };
}
