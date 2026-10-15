#!/bin/sh
set -eu
case "$(uname -m)" in
  x86_64) arch=x86_64; checksum=b761e3a0721dbae9c09a0059e5fdb2bf917d1b4a8a7b430fb3b5aafb0984b2c4 ;;
  aarch64) arch=arm64; checksum=f7e243dff54d60bcc576e94d6166b69f410f2500ae4a9ceef34315be10e77971 ;;
  *) echo 'Unsupported WASI SDK architecture' >&2; exit 1 ;;
esac
archive=$(mktemp)
trap 'rm -f "$archive"' EXIT
curl -fsSL --connect-timeout 20 --max-time 600 --retry 3 "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-34/wasi-sdk-34.0-${arch}-linux.tar.gz" -o "$archive"
printf '%s  %s\n' "$checksum" "$archive" | sha256sum -c -
mkdir -p /opt/wasi-sdk
tar -xzf "$archive" --strip-components=1 -C /opt/wasi-sdk
