#!/bin/sh
set -eu
VERSION="0.6.0"
TARGET="/config/custom_components/hanjoo_ir"
SOURCE="/opt/hanjoo/integration/hanjoo_ir"
MARKER="$TARGET/.hanjoo-managed"
OPTIONS="/data/options.json"

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
  [ -f "$f" ] || return 0
  sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$f" | head -n1
}

install_manager() {
  opt_bool install_manager true || return 0
  src_ver="$(manifest_version "$SOURCE")"
  dst_ver="$(manifest_version "$TARGET")"
  managed=false; [ -f "$MARKER" ] && managed=true
  if [ -d "$TARGET" ] && [ "$src_ver" = "$dst_ver" ] && [ "$managed" = true ]; then
    echo "[HanJoo IR] Manager $dst_ver already installed and managed by this add-on."
    return 0
  fi
  if [ -d "$TARGET" ] && [ "$managed" = false ]; then
    backup="/config/custom_components/hanjoo_ir.backup-before-addon-$(date +%Y%m%d-%H%M%S)"
    echo "[HanJoo IR] Existing unmanaged/HACS Manager $dst_ver found; backing it up to $backup"
    cp -a "$TARGET" "$backup"
  elif [ -d "$TARGET" ] && ! opt_bool auto_update_manager true; then
    echo "[HanJoo IR] Manager auto-update disabled; keeping installed $dst_ver"
    return 0
  fi
  stage="/config/custom_components/.hanjoo_ir.stage.$$"
  rm -rf "$stage"
  mkdir -p /config/custom_components
  cp -a "$SOURCE" "$stage"
  printf '%s\n' "$VERSION" > "$stage/.hanjoo-managed"
  rm -rf "$TARGET.old"
  [ -d "$TARGET" ] && mv "$TARGET" "$TARGET.old"
  mv "$stage" "$TARGET"
  rm -rf "$TARGET.old"
  echo "[HanJoo IR] Installed/updated Manager integration to $src_ver"
  ensure_bootstrap
  touch /data/manager_restart_required
}

ensure_bootstrap() {
  cfg="/config/configuration.yaml"
  [ -f "$cfg" ] || touch "$cfg"
  if grep -Eq '^[[:space:]]*hanjoo_ir[[:space:]]*:' "$cfg"; then
    return 0
  fi
  cat >> "$cfg" <<'EOC'

# HanJoo IR bootstrap (managed by HanJoo IR Core add-on)
hanjoo_ir:
EOC
  echo "[HanJoo IR] Added 'hanjoo_ir:' bootstrap to configuration.yaml"
}

cleanup(){
  kill "${probe_pid:-}" "${brain_pid:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[HanJoo IR Core] Starting unified add-on $VERSION"
install_manager
if [ -f /data/manager_restart_required ]; then
  echo "[HanJoo IR] Manager files changed. Restart Home Assistant Core once; the integration will self-create its config entry."
fi
node /opt/hanjoo/probe_server.cjs 8101 >/tmp/hanjoo-ir-probe.log 2>&1 &
probe_pid=$!
/opt/hanjoo/hanjoo_brain 8102 >/tmp/hanjoo-ir-brain.log 2>&1 &
brain_pid=$!
exec node /opt/hanjoo/core_runtime.cjs 8099
