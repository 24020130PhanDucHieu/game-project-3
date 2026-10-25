"""Sinh frontend/components/arena/live/views/ai-cup/task-templates.ts từ bot-runner/app/aitasks/reference.py.

Chạy: python scripts/gen_task_templates.py   (test tests/unit/test_aitasks.py kiểm tra hai bản không lệch nhau)
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'bot-runner'))
from app.aitasks import reference  # noqa: E402

TARGET = ROOT / 'frontend' / 'components' / 'arena' / 'live' / 'views' / 'ai-cup' / 'task-templates.ts'


def literal(code):
    assert '`' not in code and '${' not in code and chr(92) not in code, 'mã mẫu không được chứa dấu huyền, ${ hay gạch ngược'
    return code


def render():
    out = '/** Mã mẫu cho đề học từ thế cờ. Sinh từ bot-runner/app/aitasks/reference.py bằng scripts/gen_task_templates.py; đừng sửa tay. */\n\n'
    out += 'export const MLP_TEMPLATE = `' + literal(reference.REFERENCE_CODE) + '`\n\n'
    out += 'export const SCRATCH_TEMPLATE = `' + literal(reference.SCRATCH_CODE) + '`\n\n'
    out += 'export const NAIVE_TEMPLATE = `' + literal(reference.NAIVE_CODE) + '`\n\n'
    out += ("export const TASK_TEMPLATES = [\n"
            "  { id: 'mlp', label: 'Mẫu 1: đặc trưng + MLP (nnlite)', code: MLP_TEMPLATE },\n"
            "  { id: 'scratch', label: 'Mẫu 2: tự viết xuôi/ngược', code: SCRATCH_TEMPLATE },\n"
            "  { id: 'naive', label: 'Mẫu 3: tối giản', code: NAIVE_TEMPLATE },\n"
            "]\n")
    return out


if __name__ == '__main__':
    TARGET.write_text(render(), encoding='utf-8')
    print('wrote', TARGET)
