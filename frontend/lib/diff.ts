/** So sánh hai đoạn mã theo dòng (LCS). Đủ nhanh cho bot ≤ 64 KB (vài nghìn dòng). */

export type DiffLine = { kind: 'same' | 'add' | 'del'; text: string; left?: number; right?: number }

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.replace(/\r\n/g, '\n').split('\n')
  const b = after.replace(/\r\n/g, '\n').split('\n')
  // Bỏ phần đầu/cuối giống nhau để bảng LCS nhỏ lại.
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }
  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  const n = midA.length
  const m = midB.length
  const out: DiffLine[] = []
  for (let i = 0; i < start; i++) out.push({ kind: 'same', text: a[i], left: i + 1, right: i + 1 })
  if (n * m > 6_000_000) {
    // Quá lớn: hiển thị xóa toàn bộ rồi thêm toàn bộ phần giữa.
    midA.forEach((t, i) => out.push({ kind: 'del', text: t, left: start + i + 1 }))
    midB.forEach((t, j) => out.push({ kind: 'add', text: t, right: start + j + 1 }))
  } else {
    const table = new Uint32Array((n + 1) * (m + 1))
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * (m + 1) + j] = midA[i] === midB[j] ? table[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(table[(i + 1) * (m + 1) + j], table[i * (m + 1) + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < n && j < m) {
      if (midA[i] === midB[j]) { out.push({ kind: 'same', text: midA[i], left: start + i + 1, right: start + j + 1 }); i++; j++ }
      else if (table[(i + 1) * (m + 1) + j] >= table[i * (m + 1) + j + 1]) { out.push({ kind: 'del', text: midA[i], left: start + i + 1 }); i++ }
      else { out.push({ kind: 'add', text: midB[j], right: start + j + 1 }); j++ }
    }
    for (; i < n; i++) out.push({ kind: 'del', text: midA[i], left: start + i + 1 })
    for (; j < m; j++) out.push({ kind: 'add', text: midB[j], right: start + j + 1 })
  }
  for (let k = 0; k < a.length - endA; k++) out.push({ kind: 'same', text: a[endA + k], left: endA + k + 1, right: endB + k + 1 })
  return out
}

export function diffStats(lines: DiffLine[]) {
  return { added: lines.filter((l) => l.kind === 'add').length, removed: lines.filter((l) => l.kind === 'del').length }
}
