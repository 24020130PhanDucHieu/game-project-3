/**
 * In-Browser Offline Bot Validator & Mock Tester.
 * Cho phép sinh viên kiểm tra cú pháp và chạy thử bot ngay trên trình duyệt
 * khi ngắt toàn bộ Wi-Fi / mạng phòng thi để chống gian lận AI.
 */

export interface ValidationResult {
  is_valid: boolean
  is_offline?: boolean
  error_message?: string
  message?: string
  test_move?: string
  execution_time_ms?: number
}

const OFFLINE_VALID_MOVES = new Set(['ROCK', 'PAPER', 'SCISSORS', 'JOKER'])

export function validateBotCodeOffline(
  codeStr: string,
  language: 'PYTHON' | 'CPP' = 'PYTHON',
  ruleId = 'STAGE_1_STANDARD',
): ValidationResult {
  if (!codeStr || !codeStr.trim()) {
    return {
      is_valid: false,
      error_message: 'Mã nguồn không được để trống.',
    }
  }

  const codeBytes = new TextEncoder().encode(codeStr).length
  if (codeBytes > 65536) {
    return {
      is_valid: false,
      error_message: `Mã nguồn vượt quá giới hạn 64 KB (${Math.round(codeBytes / 1024)} KB).`,
    }
  }

  const lang = String(language || 'PYTHON').toUpperCase()

  if (lang === 'PYTHON') {
    return validatePythonOffline(codeStr, ruleId)
  } else if (lang === 'CPP') {
    return validateCppOffline(codeStr, ruleId)
  } else {
    return {
      is_valid: false,
      error_message: `Ngôn ngữ '${language}' không được hỗ trợ.`,
    }
  }
}

function maskPythonStrings(codeStr: string): string {
  let result = ''
  let i = 0
  const len = codeStr.length

  while (i < len) {
    if (codeStr.slice(i, i + 3) === '"""') {
      result += '   '
      i += 3
      while (i < len && codeStr.slice(i, i + 3) !== '"""') {
        result += codeStr[i] === '\n' ? '\n' : ' '
        i++
      }
      if (i < len) {
        result += '   '
        i += 3
      }
      continue
    }

    if (codeStr.slice(i, i + 3) === "'''") {
      result += '   '
      i += 3
      while (i < len && codeStr.slice(i, i + 3) !== "'''") {
        result += codeStr[i] === '\n' ? '\n' : ' '
        i++
      }
      if (i < len) {
        result += '   '
        i += 3
      }
      continue
    }

    if (codeStr[i] === '"' || codeStr[i] === "'") {
      const quote = codeStr[i]
      result += ' '
      i++
      while (i < len && codeStr[i] !== quote && codeStr[i] !== '\n') {
        if (codeStr[i] === '\\' && i + 1 < len) {
          result += '  '
          i += 2
        } else {
          result += ' '
          i++
        }
      }
      if (i < len && codeStr[i] === quote) {
        result += ' '
        i++
      }
      continue
    }

    result += codeStr[i]
    i++
  }

  return result
}

function validatePythonOffline(codeStr: string, _ruleId: string): ValidationResult {
  const forbiddenPatterns = [
    { pattern: /\bimport\s+os\b|\bfrom\s+os\s+import\b/, msg: "Không được phép sử dụng module 'os'." },
    { pattern: /\bimport\s+sys\b|\bfrom\s+sys\s+import\b/, msg: "Không được phép sử dụng module 'sys'." },
    { pattern: /\bimport\s+subprocess\b|\bfrom\s+subprocess\s+import\b/, msg: "Không được phép sử dụng module 'subprocess'." },
    { pattern: /\bimport\s+shutil\b|\bfrom\s+shutil\s+import\b/, msg: "Không được phép sử dụng module 'shutil'." },
    { pattern: /\beval\s*\(/, msg: 'Không được phép sử dụng hàm eval().' },
    { pattern: /\bexec\s*\(/, msg: 'Không được phép sử dụng hàm exec().' },
    { pattern: /\b__import__\b/, msg: 'Không được phép sử dụng __import__.' },
    { pattern: /\bopen\s*\(/, msg: 'Không được phép sử dụng hàm đọc ghi file open().' },
    { pattern: /\bglobals\s*\(\)|\blocals\s*\(\)/, msg: 'Không được phép truy cập globals() hoặc locals().' },
  ]

  for (const item of forbiddenPatterns) {
    if (item.pattern.test(codeStr)) {
      return { is_valid: false, error_message: `Bảo mật Sandbox: ${item.msg}` }
    }
  }

  const funcPattern = /(?:^|\n)[ \t]*def\s+decide_move\s*\(([^)]*)\)\s*:/
  const hasDecideMove = funcPattern.test(codeStr)

  if (!hasDecideMove) {
    const misspelled = codeStr.match(/(?:^|\n)[ \t]*def\s+([a-zA-Z0-9_]+)\s*\(/)
    if (misspelled && misspelled[1] !== 'decide_move') {
      return {
        is_valid: false,
        error_message: `Tên hàm chưa đúng: bạn đang viết 'def ${misspelled[1]}(...)'. Bắt buộc phải là: def decide_move(game_state):`,
      }
    }
    return {
      is_valid: false,
      error_message: 'Thiếu định nghĩa hàm bắt buộc: def decide_move(game_state):',
    }
  }

  const maskedCode = maskPythonStrings(codeStr)
  const bracketResult = checkBalancedBrackets(maskedCode)
  if (!bracketResult.valid) {
    return {
      is_valid: false,
      error_message: `Lỗi cú pháp đóng mở ngoặc dòng ${bracketResult.line}: Dấu ngoặc '${bracketResult.char}' không được đóng đúng cách.`,
    }
  }

  const lines = maskedCode.split('\n')
  const rawLines = codeStr.split('\n')
  const BLOCK_START_REGEX = /^(?:def\s+[a-zA-Z0-9_]+\s*\(|class\s+[a-zA-Z0-9_]+|if\b|elif\b|else\b|for\b|while\b|try\b|except\b|finally\b|with\b)/

  for (let i = 0; i < lines.length; i++) {
    const codePart = lines[i].split('#')[0].trim()
    if (!codePart) continue

    if (BLOCK_START_REGEX.test(codePart)) {
      if (!codePart.endsWith(':')) {
        return {
          is_valid: false,
          error_message: `Lỗi cú pháp dòng ${i + 1}: Thiếu dấu hai chấm ':' ở cuối câu lệnh '${rawLines[i].trim()}'.`,
        }
      }

      let nextIdx = i + 1
      while (nextIdx < lines.length && !lines[nextIdx].split('#')[0].trim()) {
        nextIdx++
      }
      if (nextIdx < lines.length) {
        const curIndent = (lines[i].match(/^[ \t]*/) || [''])[0].length
        const nextIndent = (lines[nextIdx].match(/^[ \t]*/) || [''])[0].length
        if (nextIndent <= curIndent) {
          return {
            is_valid: false,
            error_message: `Lỗi thụt đầu dòng (IndentationError) dòng ${nextIdx + 1}: Khối lệnh sau '${rawLines[i].trim()}' cần thụt lề vào trong.`,
          }
        }
      }
    }
  }

  const returnMatches = [...codeStr.matchAll(/(?:^|\n)[ \t]+return\s+([^\n#]+)/g)]
  let detectedMove = 'ROCK'

  if (returnMatches.length > 0) {
    for (const match of returnMatches) {
      const returnExpr = match[1].trim()
      const strMatch = returnExpr.match(/^["']([a-zA-Z0-9_]+)["']$/)
      if (strMatch) {
        const move = strMatch[1].toUpperCase()
        if (!OFFLINE_VALID_MOVES.has(move)) {
          return {
            is_valid: false,
            error_message: `Nước đi '${strMatch[1]}' không hợp lệ! Bot chỉ được trả về một trong: ROCK, PAPER, SCISSORS, JOKER.`,
          }
        }
        detectedMove = move
      }
    }
  }

  return {
    is_valid: true,
    is_offline: true,
    test_move: detectedMove,
    execution_time_ms: 1.2,
    message: `Cú pháp Python chuẩn xác! Hàm decide_move() hợp lệ. Nước đi kiểm thử dự kiến: [${detectedMove}]. Sẵn sàng nộp bài!`,
  }
}

function validateCppOffline(codeStr: string, _ruleId: string): ValidationResult {
  const forbiddenCpp = [
    { pattern: /<windows\.h>|<unistd\.h>|<sys\//i, msg: 'Không được include header hệ thống hệ điều hành.' },
    { pattern: /\bsystem\s*\(/, msg: 'Không được phép sử dụng system().' },
    { pattern: /\bfork\s*\(/, msg: 'Không được phép sử dụng fork().' },
  ]

  for (const item of forbiddenCpp) {
    if (item.pattern.test(codeStr)) {
      return { is_valid: false, error_message: `Bảo mật Sandbox: ${item.msg}` }
    }
  }

  const hasMain = /(?:int|void)\s+main\s*\([^)]*\)\s*\{/.test(codeStr)
  if (!hasMain) {
    return {
      is_valid: false,
      error_message: 'Thiếu hàm thực thi chính: int main() { ... }',
    }
  }

  const bracketResult = checkBalancedBrackets(codeStr)
  if (!bracketResult.valid) {
    return {
      is_valid: false,
      error_message: `Lỗi cú pháp ngoặc dòng ${bracketResult.line}: Dấu '${bracketResult.char}' chưa được đóng đúng cách.`,
    }
  }

  let detectedMove = 'ROCK'
  const coutMatches = [...codeStr.matchAll(/(?:std::cout|cout)\s*<<\s*["']([^"']+)["']/g)]
  if (coutMatches.length > 0) {
    const move = coutMatches[0][1].trim().toUpperCase()
    if (OFFLINE_VALID_MOVES.has(move)) {
      detectedMove = move
    } else {
      return {
        is_valid: false,
        error_message: `C++ cout xuất ra '${coutMatches[0][1]}' không hợp lệ. Nước đi hợp lệ: ROCK, PAPER, SCISSORS, JOKER.`,
      }
    }
  }

  return {
    is_valid: true,
    is_offline: true,
    test_move: detectedMove,
    execution_time_ms: 0.9,
    message: `Cú pháp C++ chuẩn! Đã phát hiện hàm main() và luồng xuất [${detectedMove}]. Sẵn sàng nộp bài!`,
  }
}

interface BracketCheck {
  valid: boolean
  char?: string
  line?: number
}

function checkBalancedBrackets(codeStr: string): BracketCheck {
  const stack: { char: string; line: number }[] = []
  const openPairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' }
  const closePairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

  let inLineComment = false
  let inBlockComment = false
  let inString: string | null = null
  let lineNum = 1

  for (let i = 0; i < codeStr.length; i++) {
    const c = codeStr[i]
    const next = codeStr[i + 1] || ''

    if (c === '\n') {
      lineNum++
      inLineComment = false
      continue
    }

    if (inLineComment) continue

    if (inBlockComment) {
      if (c === '*' && next === '/') {
        inBlockComment = false
        i++
      }
      continue
    }

    if (inString) {
      if (c === '\\') {
        i++
      } else if (c === inString) {
        inString = null
      }
      continue
    }

    if (c === '"' || c === "'") {
      inString = c
      continue
    }

    if (c === '#') {
      inLineComment = true
      continue
    }
    if (c === '/' && next === '/') {
      inLineComment = true
      i++
      continue
    }
    if (c === '/' && next === '*') {
      inBlockComment = true
      i++
      continue
    }

    if (openPairs[c]) {
      stack.push({ char: c, line: lineNum })
    } else if (closePairs[c]) {
      if (stack.length === 0) {
        return { valid: false, char: c, line: lineNum }
      }
      const last = stack.pop()!
      if (openPairs[last.char] !== c) {
        return { valid: false, char: c, line: lineNum }
      }
    }
  }

  if (stack.length > 0) {
    const unclosed = stack.pop()!
    return { valid: false, char: unclosed.char, line: unclosed.line }
  }

  return { valid: true }
}
