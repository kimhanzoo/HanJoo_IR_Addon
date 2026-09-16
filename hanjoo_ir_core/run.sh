#!/bin/sh
set -eu

VERSION="0.6.3"
export HANJOO_VERSION="$VERSION"
SOURCE="/opt/hanjoo/integration/hanjoo_ir"
OPTIONS="/data/options.json"

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
OWNER_MARKER="/data/manager_owned"
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
  managed=false
  if [ -f "$MARKER" ] || [ -f "$OWNER_MARKER" ]; then
    managed=true
  fi

  echo "[HanJoo IR] Bundled Manager version: $src_ver"
  echo "[HanJoo IR] Installed Manager version: $dst_ver (managed=$managed)"

  if [ "$src_ver" = "not-installed" ] || [ "$src_ver" = "unknown" ]; then
    echo "[HanJoo IR] ERROR: Bundled Manager manifest is missing or invalid."
    exit 1
  fi

  if [ -d "$TARGET" ] && [ "$src_ver" = "$dst_ver" ]; then
    if [ "$managed" = true ]; then
      printf '%s\n' "$src_ver" > "$OWNER_MARKER"
      [ -f "$MARKER" ] || printf '%s\n' "$src_ver" > "$MARKER"
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
  printf '%s\n' "$src_ver" > "$stage/.hanjoo-managed"

  rm -rf "$TARGET.old"
  if [ -d "$TARGET" ]; then
    mv "$TARGET" "$TARGET.old"
  fi
  if ! mv "$stage" "$TARGET"; then
    echo "[HanJoo IR] ERROR: Failed to install Manager; restoring previous copy."
    rm -rf "$stage" "$TARGET"
    [ -d "$TARGET.old" ] && mv "$TARGET.old" "$TARGET"
    exit 1
  fi
  rm -rf "$TARGET.old"
  printf '%s\n' "$src_ver" > "$OWNER_MARKER"

  ensure_bootstrap
  touch "$RESTART_MARKER"
  echo "[HanJoo IR] SUCCESS: Manager integration installed/updated to $src_ver"
  echo "[HanJoo IR] Restart Home Assistant Core once to load the new Manager version."
}

http_ok() {
  url="$1"
  node -e '
    const http=require("node:http");
    const u=process.argv[1];
    const r=http.get(u,x=>{
      let raw="";
      x.setEncoding("utf8");
      x.on("data",c=>raw+=c);
      x.on("end",()=>{
        if(x.statusCode<200||x.statusCode>=300) process.exit(1);
        try { const j=JSON.parse(raw||"{}"); process.exit(j.ok===true?0:1); }
        catch { process.exit(1); }
      });
    });
    r.on("error",()=>process.exit(1));
    r.setTimeout(700,()=>{r.destroy();process.exit(1)});
  ' "$url" >/dev/null 2>&1
}

wait_http() {
  name="$1"; url="$2"; pid="$3"; logfile="$4"
  i=0
  while [ "$i" -lt 40 ]; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "[HanJoo IR] ERROR: $name exited during startup."
      [ -f "$logfile" ] && { echo "----- $name log -----"; cat "$logfile"; echo "---------------------"; }
      return 1
    fi
    if http_ok "$url"; then
      echo "[HanJoo IR] $name healthy: $url"
      return 0
    fi
    i=$((i+1))
    sleep 0.25
  done
  echo "[HanJoo IR] ERROR: $name did not become healthy within 10 seconds."
  [ -f "$logfile" ] && { echo "----- $name log -----"; cat "$logfile"; echo "---------------------"; }
  return 1
}

cleanup() {
  trap - EXIT INT TERM
  for pid in "${core_pid:-}" "${probe_pid:-}" "${brain_pid:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

fail_service() {
  name="$1"; logfile="$2"
  echo "[HanJoo IR] ERROR: $name stopped unexpectedly; shutting down add-on so Supervisor can restart it."
  [ -f "$logfile" ] && { echo "----- $name log -----"; tail -100 "$logfile"; echo "---------------------"; }
  exit 1
}

echo "============================================================"
echo "[HanJoo IR] Starting unified add-on $VERSION"
echo "[HanJoo IR] Config root: $CONFIG_ROOT"
echo "============================================================"
install_manager

: > /tmp/hanjoo-ir-probe.log
: > /tmp/hanjoo-ir-brain.log
: > /tmp/hanjoo-ir-core.log

node /opt/hanjoo/probe_server.cjs 8101 >>/tmp/hanjoo-ir-probe.log 2>&1 &
probe_pid=$!
node /opt/hanjoo/brain_runtime.cjs 8102 >>/tmp/hanjoo-ir-brain.log 2>&1 &
brain_pid=$!
node /opt/hanjoo/core_runtime.cjs 8099 >>/tmp/hanjoo-ir-core.log 2>&1 &
core_pid=$!

echo "[HanJoo IR] Protocol sidecar process started on :8101 (pid=$probe_pid)"
echo "[HanJoo IR] Brain process started on :8102 (pid=$brain_pid)"
echo "[HanJoo IR] Core gateway process started on :8099 (pid=$core_pid)"

wait_http "Protocol sidecar" "http://127.0.0.1:8101/health" "$probe_pid" /tmp/hanjoo-ir-probe.log || exit 1
wait_http "Brain service" "http://127.0.0.1:8102/health" "$brain_pid" /tmp/hanjoo-ir-brain.log || exit 1
wait_http "Core gateway" "http://127.0.0.1:8099/health" "$core_pid" /tmp/hanjoo-ir-core.log || exit 1

echo "============================================================"
echo "[HanJoo IR] All services healthy — Core $VERSION is ready"
echo "============================================================"

# Keep PID 1 as a watchdog. If any required service dies, fail the add-on rather
# than leaving a misleading green 'Running' state with a broken Brain/sidecar.
while :; do
  kill -0 "$probe_pid" 2>/dev/null || fail_service "Protocol sidecar" /tmp/hanjoo-ir-probe.log
  kill -0 "$brain_pid" 2>/dev/null || fail_service "Brain service" /tmp/hanjoo-ir-brain.log
  kill -0 "$core_pid" 2>/dev/null || fail_service "Core gateway" /tmp/hanjoo-ir-core.log
  sleep 2
done
