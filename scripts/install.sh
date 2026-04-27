#!/usr/bin/env sh
set -eu

REPO="specterworksco/capsule"
INSTALL_DIR="${CAPSULE_INSTALL_DIR:-$HOME/.capsule/bin}"

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

asset="capsule-$os-$arch"
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
echo "Capsule added to your PATH in your shell profile files. Restart your shell or source the file to use it immediately."

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
