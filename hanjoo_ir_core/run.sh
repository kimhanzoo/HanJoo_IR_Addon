#!/bin/sh
set -eu
VERSION="0.6.1"
SOURCE="/opt/hanjoo/integration/hanjoo_ir"
OPTIONS="/data/options.json"

# Home Assistant add-ons normally expose the config mapping at /config.
# Keep /homeassistant as a compatibility fallback for alternate layouts.
if [ -d /config ]; then
  CONFIG_ROOT="/config"
elif [ -d /homeassistant ]; then
  CONFIG_ROOT="/homeassistant"
else
  echo "[HanJoo IR] ERROR: Home Assistant config mapping is not available."
  echo "[HanJoo IR] Expected /config or /homeassistant. Check add-on map: config:rw"
  exit 1
fi
TARGET="$CONFIG_ROOT/custom_components/hanjoo_ir"
MARKER="$TARGET/.hanjoo-managed"
RESTART_MARKER="/data/manager_restart_required"

opt_bool() {
  key="$1"; default="$2"
  if [ -f "$OPTIONS" ]; then
    value="$(sed -n 's/.*"'"$key"'"[[:space:]]*:[[:space:]]*\(true\|false\).*/\1/p' "$OPTIONS" | head -n1)"
    [ -n "$value" ] && { [ "$value" = "true" ] && return 0 || return 1; }
  fi
  [ "$default" = "true" ]
}

manifest_version() {
  f="$1/manifest.json"
  [ -f "$f" ] || { printf '%s' "not-installed"; return 0; }
  v="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$f" | head -n1)"
  [ -n "$v" ] && printf '%s' "$v" || printf '%s' "unknown"
}

ensure_bootstrap() {
  cfg="$CONFIG_ROOT/configuration.yaml"
  [ -f "$cfg" ] || touch "$cfg"
  if grep -Eq '^[[:space:]]*hanjoo_ir[[:space:]]*:' "$cfg"; then
    echo "[HanJoo IR] Bootstrap already present in configuration.yaml"
    return 0
  fi
  cat >> "$cfg" <<'EOC'

# HanJoo IR bootstrap (managed by HanJoo IR Core add-on)
hanjoo_ir:
EOC
  echo "[HanJoo IR] Added 'hanjoo_ir:' bootstrap to configuration.yaml"
}

install_manager() {
  if ! opt_bool install_manager true; then
    echo "[HanJoo IR] Manager auto-install is disabled by add-on option."
    return 0
  fi

  mkdir -p "$CONFIG_ROOT/custom_components"
  src_ver="$(manifest_version "$SOURCE")"
  dst_ver="$(manifest_version "$TARGET")"
  managed=false; [ -f "$MARKER" ] && managed=true

  echo "[HanJoo IR] Bundled Manager version: $src_ver"
  echo "[HanJoo IR] Installed Manager version: $dst_ver (managed=$managed)"

  if [ -d "$TARGET" ] && [ "$src_ver" = "$dst_ver" ]; then
    if [ "$managed" = true ]; then
      echo "[HanJoo IR] Manager $dst_ver already installed and managed by this add-on."
    else
      echo "[HanJoo IR] Existing HACS/manual Manager $dst_ver already matches bundled version; leaving files untouched."
    fi
    ensure_bootstrap
    return 0
  fi

  if [ -d "$TARGET" ] && ! opt_bool auto_update_manager true; then
    echo "[HanJoo IR] Manager auto-update disabled; keeping installed $dst_ver"
    ensure_bootstrap
    return 0
  fi

  if [ -d "$TARGET" ] && [ "$managed" = false ]; then
    backup="$CONFIG_ROOT/custom_components/hanjoo_ir.backup-before-addon-$(date +%Y%m%d-%H%M%S)"
    echo "[HanJoo IR] Existing HACS/manual Manager $dst_ver found; backing it up to $backup"
    cp -a "$TARGET" "$backup"
  fi

  stage="$CONFIG_ROOT/custom_components/.hanjoo_ir.stage.$$"
  rm -rf "$stage"
  cp -a "$SOURCE" "$stage"
  printf '%s\n' "$VERSION" > "$stage/.hanjoo-managed"
  rm -rf "$TARGET.old"
  [ -d "$TARGET" ] && mv "$TARGET" "$TARGET.old"
  mv "$stage" "$TARGET"
  rm -rf "$TARGET.old"
  ensure_bootstrap
  touch "$RESTART_MARKER"
  echo "[HanJoo IR] SUCCESS: Manager integration installed/updated to $src_ver"
  echo "[HanJoo IR] Restart Home Assistant Core once to load the new Manager version."
}

cleanup(){
  kill "${probe_pid:-}" "${brain_pid:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "============================================================"
echo "[HanJoo IR] Starting unified add-on $VERSION"
echo "[HanJoo IR] Config root: $CONFIG_ROOT"
echo "============================================================"
install_manager

node /opt/hanjoo/probe_server.cjs 8101 >/tmp/hanjoo-ir-probe.log 2>&1 &
probe_pid=$!
/opt/hanjoo/hanjoo_brain 8102 >/tmp/hanjoo-ir-brain.log 2>&1 &
brain_pid=$!

echo "[HanJoo IR] Protocol sidecar started on :8101 (pid=$probe_pid)"
echo "[HanJoo IR] Brain service started on :8102 (pid=$brain_pid)"
echo "[HanJoo IR] Core gateway starting on :8099"
exec node /opt/hanjoo/core_runtime.cjs 8099
