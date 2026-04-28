#!/usr/bin/env sh
set -eu

REPO="specterworksco/capsule"
INSTALL_DIR="${CAPSULE_INSTALL_DIR:-$HOME/.capsule/bin}"
TARGET_OVERRIDE="${CAPSULE_INSTALL_TARGET:-}"
VARIANT="${CAPSULE_INSTALL_VARIANT:-default}"

add_path() {
  file="$1"

  mkdir -p "$(dirname "$file")"

  if [ ! -e "$file" ]; then
    : > "$file"
  fi

  if grep -Fqs "# Capsule PATH" "$file"; then
    return 0
  fi

  {
    printf '\n# Capsule PATH\n'
    printf 'case ":$PATH:" in\n'
    printf '  *":%s:"*) ;;\n' "$INSTALL_DIR"
    printf '  *) export PATH="%s:$PATH" ;;\n' "$INSTALL_DIR"
    printf 'esac\n'
  } >> "$file"
}

is_musl() {
  if command -v ldd >/dev/null 2>&1 && ldd --version 2>&1 | grep -qi musl; then
    return 0
  fi

  ls /lib/ld-musl-*.so.1 >/dev/null 2>&1
}

asset_from_target() {
  case "$1" in
    bun-darwin-x64) printf '%s\n' "capsule-macos-x64" ;;
    bun-darwin-x64-baseline) printf '%s\n' "capsule-macos-x64-baseline" ;;
    bun-darwin-arm64) printf '%s\n' "capsule-macos-arm64" ;;
    bun-linux-x64) printf '%s\n' "capsule-linux-x64" ;;
    bun-linux-x64-baseline) printf '%s\n' "capsule-linux-x64-baseline" ;;
    bun-linux-x64-modern) printf '%s\n' "capsule-linux-x64-modern" ;;
    bun-linux-arm64) printf '%s\n' "capsule-linux-arm64" ;;
    bun-linux-x64-musl) printf '%s\n' "capsule-linux-x64-musl" ;;
    bun-linux-arm64-musl) printf '%s\n' "capsule-linux-arm64-musl" ;;
    *) return 1 ;;
  esac
}

resolve_asset() {
  if [ -n "$TARGET_OVERRIDE" ]; then
    asset_from_target "$TARGET_OVERRIDE" || {
      echo "Unsupported CAPSULE_INSTALL_TARGET: $TARGET_OVERRIDE" >&2
      exit 1
    }
    return 0
  fi

  case "$os-$arch:$VARIANT" in
    macos-x64:default) printf '%s\n' "capsule-macos-x64" ;;
    macos-x64:baseline) printf '%s\n' "capsule-macos-x64-baseline" ;;
    macos-arm64:default) printf '%s\n' "capsule-macos-arm64" ;;
    linux-x64:default)
      if is_musl; then
        printf '%s\n' "capsule-linux-x64-musl"
      else
        printf '%s\n' "capsule-linux-x64"
      fi
      ;;
    linux-x64:baseline) printf '%s\n' "capsule-linux-x64-baseline" ;;
    linux-x64:modern) printf '%s\n' "capsule-linux-x64-modern" ;;
    linux-x64:musl) printf '%s\n' "capsule-linux-x64-musl" ;;
    linux-arm64:default)
      if is_musl; then
        printf '%s\n' "capsule-linux-arm64-musl"
      else
        printf '%s\n' "capsule-linux-arm64"
      fi
      ;;
    linux-arm64:musl) printf '%s\n' "capsule-linux-arm64-musl" ;;
    *)
      echo "Unsupported install variant '$VARIANT' for $os-$arch" >&2
      exit 1
      ;;
  esac
}

case "$(uname -s)" in
  Darwin)
    os="macos"
    ;;
  Linux)
    os="linux"
    ;;
  *)
    echo "Unsupported OS: $(uname -s)" >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  x86_64|amd64)
    arch="x64"
    ;;
  arm64|aarch64)
    arch="arm64"
    ;;
  *)
    echo "Unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

asset="$(resolve_asset)"
url="https://github.com/$REPO/releases/latest/download/$asset"

mkdir -p "$INSTALL_DIR"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

echo "Downloading $url"
curl -fsSL "$url" -o "$tmp"
chmod +x "$tmp"
mv "$tmp" "$INSTALL_DIR/capsule"

add_path "$HOME/.profile"
add_path "$HOME/.bashrc"
add_path "$HOME/.bash_profile"
add_path "$HOME/.zshrc"

export PATH="$INSTALL_DIR:$PATH"

echo "Capsule installed to $INSTALL_DIR/capsule"
echo "Installed release asset: $asset"
echo "Capsule added to your PATH in your shell profile files. Restart your shell or source the file to use it immediately."
