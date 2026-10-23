"""Generate the Next portal from the maintained, functional tournament UI."""
import hashlib
import json
import re
import shutil

from build_frontend import FRONTEND, ROOT, render_templates


def prepare():
    app = ROOT / 'arena-ottv-2-redesign'
    public = app / 'public'
    public.mkdir(exist_ok=True)
    html = render_templates()
    styles = re.findall(r'<link[^>]+href="([^"]+)"[^>]+rel="stylesheet"', html)
    scripts = re.findall(r'<script[^>]+src="([^"]+)"[^>]*></script>', html)
    body = re.search(r'<body[^>]*>([\s\S]*)</body>', html).group(1)
    body = re.sub(r'<script\b[\s\S]*?</script>', '', body)
    def version(url):
        if not url.startswith('/'):
            return url
        path = FRONTEND / url.split('?')[0].lstrip('/')
        digest = hashlib.sha256(path.read_bytes()).hexdigest()[:12]
        return url.split('?')[0] + '?v=' + digest
    styles = list(map(version, styles))
    scripts = list(map(version, scripts))
    for name in ('static', 'assets'):
        target = public / name
        if target.is_symlink() or target.resolve().parent != public.resolve():
            raise ValueError('Generated assets must remain inside Next public directory')
        shutil.copytree(FRONTEND / name, target, dirs_exist_ok=True)
    shutil.copyfile(FRONTEND / 'sw.js', public / 'sw.js')
    urls = ['/', '/index.html'] + [u for u in styles + scripts if u.startswith('/')]
    urls += ['/' + p.relative_to(public).as_posix() for p in (public / 'assets').rglob('*') if p.is_file()]
    (public / 'offline-assets.json').write_text(json.dumps(sorted(set(urls))), encoding='utf-8')
    generated = app / 'generated'
    generated.mkdir(exist_ok=True)
    (generated / 'portal.json').write_text(json.dumps({'html': body, 'styles': styles, 'scripts': scripts}, ensure_ascii=False), encoding='utf-8')
    print('Next portal prepared from maintained templates and runtime')


if __name__ == '__main__':
    prepare()
