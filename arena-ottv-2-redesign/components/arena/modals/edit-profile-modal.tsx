'use client'

import { useState } from 'react'
import { Save, User, Users } from 'lucide-react'
import { Btn, Field, Modal, Notice, SelectField, TextArea } from '../primitives'

export type TeamProfileData = {
  name: string
  captain: string
  uni: string
  lang: 'PYTHON' | 'CPP'
  bio: string
  member2Name?: string
  member2Sid?: string
  member3Name?: string
  member3Sid?: string
}

export function EditProfileModal({
  open,
  onClose,
  initialData = {
    name: 'ap (Cú Đêm K69)',
    captain: 'Nguyễn Minh Anh',
    uni: 'Trường ĐH Công nghệ – ĐHQGHN',
    lang: 'PYTHON',
    bio: 'Thức khuya, nghĩ sâu, tối ưu từng nước đi thuật toán.',
    member2Name: 'Trần Đức Huy',
    member2Sid: '24020281',
    member3Name: 'Lê Thu Hà',
    member3Sid: '24020295',
  },
  onSave,
}: {
  open: boolean
  onClose: () => void
  initialData?: TeamProfileData
  onSave?: (data: TeamProfileData) => void
}) {
  const [data, setData] = useState<TeamProfileData>(initialData)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  function handleChange<K extends keyof TeamProfileData>(field: K, val: TeamProfileData[K]) {
    setData((prev) => ({ ...prev, [field]: val }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      setSuccess(true)
      onSave?.(data)
      setTimeout(() => {
        setSuccess(false)
        onClose()
      }, 700)
    }, 600)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Chỉnh Sửa Thông Tin Đội Thi"
      description="Cập nhật hồ sơ công khai, thành viên nhóm và ngôn ngữ sở trường của đội."
      size="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        {success && <Notice tone="success">Đã lưu thay đổi thông tin đội thi thành công!</Notice>}

        <Field
          label="Tên đội thi đấu (*)"
          placeholder="Nhập tên đội"
          required
          value={data.name}
          onChange={(e) => handleChange('name', e.target.value)}
        />

        <Field
          label="Họ và tên Đội trưởng"
          placeholder="Họ tên đội trưởng"
          value={data.captain}
          onChange={(e) => handleChange('captain', e.target.value)}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="Trường / Đơn vị"
            placeholder="Ví dụ: ĐH Công Nghệ"
            value={data.uni}
            onChange={(e) => handleChange('uni', e.target.value)}
          />

          <SelectField
            label="Ngôn ngữ sở trường"
            value={data.lang}
            onChange={(e) => handleChange('lang', e.target.value as 'PYTHON' | 'CPP')}
          >
            <option value="PYTHON">Python 3 (.py)</option>
            <option value="CPP">C++ 17 (.cpp)</option>
          </SelectField>
        </div>

        <TextArea
          label="Khẩu hiệu / Tiểu sử đội (Bio)"
          placeholder="Giới thiệu ngắn về chiến thuật và đội thi của bạn..."
          rows={2}
          value={data.bio}
          onChange={(e) => handleChange('bio', e.target.value)}
        />

        {/* Thành viên bổ sung */}
        <div className="rounded-lg border border-border bg-secondary/30 p-3 sm:p-4">
          <span className="text-xs font-semibold text-foreground">
            Thành viên bổ sung (Thành viên 2 &amp; 3):
          </span>
          <div className="mt-2.5 flex flex-col gap-2.5">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="text"
                className="h-8 rounded-md border border-input bg-card px-2.5 text-xs outline-none focus:border-primary"
                placeholder="Họ tên thành viên 2"
                value={data.member2Name || ''}
                onChange={(e) => handleChange('member2Name', e.target.value)}
              />
              <input
                type="text"
                className="h-8 rounded-md border border-input bg-card px-2.5 text-xs outline-none focus:border-primary"
                placeholder="MSSV thành viên 2"
                value={data.member2Sid || ''}
                onChange={(e) => handleChange('member2Sid', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="text"
                className="h-8 rounded-md border border-input bg-card px-2.5 text-xs outline-none focus:border-primary"
                placeholder="Họ tên thành viên 3"
                value={data.member3Name || ''}
                onChange={(e) => handleChange('member3Name', e.target.value)}
              />
              <input
                type="text"
                className="h-8 rounded-md border border-input bg-card px-2.5 text-xs outline-none focus:border-primary"
                placeholder="MSSV thành viên 3"
                value={data.member3Sid || ''}
                onChange={(e) => handleChange('member3Sid', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="mt-2 flex justify-end gap-2 border-t border-border pt-3">
          <Btn variant="outline" type="button" onClick={onClose}>
            Hủy
          </Btn>
          <Btn variant="primary" type="submit" loading={loading}>
            <Save className="size-4" />
            Lưu Thay Đổi
          </Btn>
        </div>
      </form>
    </Modal>
  )
}
