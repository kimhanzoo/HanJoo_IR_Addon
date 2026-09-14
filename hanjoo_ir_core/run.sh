#!/bin/sh
set -eu
echo "[HanJoo IR Core] Starting Core add-on 0.5.0"
node /opt/hanjoo/probe_server.cjs 8101 >/tmp/hanjoo-ir-probe.log 2>&1 &
probe_pid=$!
cleanup(){ kill "$probe_pid" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
exec node /opt/hanjoo/core_runtime.cjs 8099
