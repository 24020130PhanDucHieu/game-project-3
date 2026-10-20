"""Measure receipt and verdict latency using pre-enrolled staging accounts.

Sessions file: a JSON array of bearer token strings (one per distinct team).
Never point this tool at a live contest. It submits real code for every token.
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import math
from pathlib import Path
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen
import uuid


def request(url, token, payload=None, submission_id=None):
    headers = {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
    if submission_id:
        headers['X-Submission-Id'] = submission_id
    req = Request(url, data=json.dumps(payload).encode() if payload is not None else None,
                  headers=headers)
    try:
        with urlopen(req, timeout=45) as response:
            return response.status, json.load(response)
    except HTTPError as exc:
        return exc.code, {}
    except (URLError, TimeoutError, OSError, ValueError):
        return 0, {}


def percentile(values, quantile):
    if not values:
        return None
    return round(sorted(values)[max(0, min(len(values)-1, math.ceil(len(values)*quantile)-1))], 3)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default='http://127.0.0.1:8080')
    parser.add_argument('--qualifier', required=True)
    parser.add_argument('--sessions-file', type=Path, required=True)
    parser.add_argument('--code-file', type=Path, required=True)
    parser.add_argument('--language', choices=['PYTHON', 'CPP'], default='PYTHON')
    parser.add_argument('--concurrency', type=int, default=20)
    parser.add_argument('--verdict-timeout', type=int, default=300)
    parser.add_argument('--allow-remote-staging', action='store_true')
    args = parser.parse_args()
    if urlparse(args.base).hostname not in ('localhost', '127.0.0.1', '::1') and not args.allow_remote_staging:
        parser.error('Remote targets require --allow-remote-staging. Use a separate staging contest.')
    if not 1 <= args.concurrency <= 200 or args.verdict_timeout < 1:
        parser.error('Concurrency must be 1..200; verdict timeout must be positive.')
    tokens = json.loads(args.sessions_file.read_text(encoding='utf-8'))
    if not isinstance(tokens, list) or not tokens or not all(isinstance(t, str) and t for t in tokens) or len(set(tokens)) != len(tokens):
        parser.error('Sessions must be a non-empty array of distinct token strings.')
    code = args.code_file.read_text(encoding='utf-8')
    if not code.strip() or len(code.encode()) > 65536:
        parser.error('Code must be 1..64 KB.')
    endpoint = args.base.rstrip('/') + '/api/qualifiers/' + args.qualifier

    def run(token):
        started = time.monotonic()
        request_id = str(uuid.uuid4())
        status, receipt = request(endpoint+'/submissions', token, {'code': code, 'language': args.language}, request_id)
        if status not in (200, 202) or not receipt.get('id'):
            return {'http': status, 'result': 'not_received'}
        accepted = time.monotonic()-started
        deadline = time.monotonic()+args.verdict_timeout
        while time.monotonic()<deadline:
            status, detail = request(endpoint, token)
            if status == 200:
                sub = next((s for s in detail.get('history', []) if s.get('id') == receipt['id']), None)
                if sub and sub.get('status') in ('VALID', 'INVALID'):
                    return {'http': 202, 'receipt_seconds': accepted, 'verdict_seconds': time.monotonic()-started,
                            'result': sub['status']}
            time.sleep(3)
        return {'http': 202, 'receipt_seconds': accepted, 'result': 'verdict_timeout'}

    began = time.monotonic()
    results = []
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        for future in as_completed([pool.submit(run, token) for token in tokens]):
            results.append(future.result())
    receipts = [r['receipt_seconds'] for r in results if 'receipt_seconds' in r]
    verdicts = [r['verdict_seconds'] for r in results if 'verdict_seconds' in r]
    report = {'teams': len(tokens), 'client_concurrency': args.concurrency, 'elapsed_seconds': round(time.monotonic()-began, 2),
              'results': dict(Counter(r['result'] for r in results)), 'http': dict(Counter(r['http'] for r in results)),
              'receipt_p50_seconds': percentile(receipts, .5), 'receipt_p95_seconds': percentile(receipts, .95),
              'verdict_p95_seconds': percentile(verdicts, .95), 'verdict_poll_interval_seconds': 3}
    print(json.dumps(report, indent=2))
    return 0 if all(r['result']=='VALID' for r in results) else 1


if __name__ == '__main__':
    raise SystemExit(main())
