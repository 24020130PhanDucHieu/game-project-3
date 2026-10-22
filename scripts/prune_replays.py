"""Read-only notice: tournament replay retention is not implemented yet."""

import argparse
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--retention-days", type=int, default=14)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    if args.retention_days < 1:
        parser.error("--retention-days must be positive")
    if args.execute:
        print("Replay deletion disabled: PostgreSQL archive and restore verification are not implemented.", file=sys.stderr)
        return 1
    print("No production replay data changed. Retention automation is not implemented.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
