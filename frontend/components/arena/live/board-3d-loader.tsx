'use client'

import { useEffect } from 'react'

/** Thay cho bàn 3D khi tệp mã 3D không tải được (ví dụ mất mạng và chưa có bản lưu): báo cho cha chuyển về 2D thay vì làm sập trang. */
export function Board3DUnavailable({ onUnsupported }: { onUnsupported?: () => void }) {
  useEffect(() => { onUnsupported?.() }, [onUnsupported])
  return null
}

/** Dùng trong dynamic(): lỗi tải chunk không được ném ra lớp bắt lỗi toàn trang. */
export const safeBoard3D = <T,>(load: () => Promise<T>) =>
  load().catch(() => ({ default: Board3DUnavailable }) as unknown as T)
