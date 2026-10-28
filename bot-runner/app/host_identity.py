"""Non-secret host identity, detected locally without cloud credentials or IMDS."""
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def host_provider():
    try:
        vendor = Path('/sys/class/dmi/id/sys_vendor').read_text().strip()
    except (OSError, UnicodeError):
        return None
    return 'AWS EC2' if vendor == 'Amazon EC2' else None
