"""Non-secret host identity, detected locally without cloud credentials or IMDS."""
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def host_provider():
    try:
        vendor = Path('/sys/class/dmi/id/sys_vendor').read_text().strip()
    except (OSError, UnicodeError):
        vendor = ''
    if vendor == 'Amazon EC2':
        return 'AWS EC2'
    # OCI Micro exposes generic QEMU DMI. cloud-init records the actual
    # datasource locally, so health never needs access to cloud metadata.
    try:
        cloud = Path('/run/cloud-init/cloud-id').read_text().strip().lower()
    except (OSError, UnicodeError):
        cloud = ''
    return 'Oracle Cloud' if cloud == 'oracle' else None
