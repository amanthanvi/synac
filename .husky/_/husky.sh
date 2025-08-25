#!/usr/bin/env sh
# Husky v8+ shell shim

# Prevent recursive sourcing
if [ -z "$husky_skip_init" ]; then
  export husky_skip_init=1

  # Ensure sh is available
  command -v sh >/dev/null 2>&1 || {
    echo "husky - sh not found in PATH" >&2
    exit 127
  }

  # Load optional user config
  if [ -f "$HOME/.huskyrc" ]; then
    . "$HOME/.huskyrc"
  fi

  # Run hook script with Husky env disabled (prevents loops)
  export HUSKY=0
  sh -e "$0" "$@"
  exit $?
fi