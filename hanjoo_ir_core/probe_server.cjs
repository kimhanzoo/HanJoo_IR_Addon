"use strict";

/*
 * Public exhaustive IR probe sidecar.
 *
 * Detection strategy:
 *   1) probe the complete capture with irtxrx + IRremoteESP8266;
 *   2) split long multi-frame AC bursts at inter-frame gaps;
 *   3) probe useful single-frame and adjacent-frame windows;
 *   4) try a few even-pulse start offsets for captures that begin mid-burst;
 *   5) merge/dedupe evidence conservatively so one physical press does not
 *      become multiple independent captures.
 *
 * This keeps the Brain generic while greatly improving stateful AC detection
 * (Daikin, Mitsubishi, Panasonic, Fujitsu, Hitachi, Gree, Midea, etc.).
 */
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const { createRequire } = require("node:module");
const requireFromRuntime = createRequire("/opt/hanjoo/package.json");
const ir = requireFromRuntime("irtxrx");

const PORT = Number(process.argv[2] || 8101);
const VERSION = process.env.HANJOO_VERSION || "0.6.6";
const MAX_TIMINGS = 20000;
const MAX_VARIANTS = 24;
const FRAME_GAP_US = 6500;
const MIN_VARIANT_TIMINGS = 10;

function safe(value) {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return Array.from(value);
  if (Array.isArray(value)) return value.map(safe);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = safe(v);
    return out;
  }
  return value;
}

function normalizeSignedTimings(values) {
  if (!Array.isArray(values)) return [];
  const out = [];
  for (const value of values.slice(0, MAX_TIMINGS)) {
    const raw = Number(value);
    const n = Math.abs(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    const rounded = Math.round(n);
    out.push(raw < 0 ? -rounded : rounded);
  }
  return out;
}

function normalizeTimings(values) {
  return normalizeSignedTimings(values).map(Math.abs);
}

function variantKey(values) {
  return values.join(",");
}

function buildTimingVariants(values) {
  const signed = normalizeSignedTimings(values);
  const abs = signed.map(Math.abs);
  const out = [];
  const seen = new Set();

  function add(label, timings, meta = {}) {
    if (out.length >= MAX_VARIANTS) return;
    const t = timings.map(Math.abs).filter(n => Number.isFinite(n) && n > 0);
    if (t.length < MIN_VARIANT_TIMINGS) return;
    const key = variantKey(t);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label, timings: t, ...meta });
  }

  add("full", abs, { full: true, frame_start: 0, frame_end: null });

  // A long SPACE between sections/frames is the strongest generic boundary.
  // Use explicit negative signs when provided; otherwise timing parity is the
  // fallback because captures conventionally start with a MARK at index 0.
  const gaps = [];
  for (let i = 1; i < signed.length - 1; i++) {
    const isSpace = signed[i] < 0 || (i % 2 === 1);
    if (isSpace && Math.abs(signed[i]) >= FRAME_GAP_US) gaps.push(i);
  }

  const starts = [0];
  const ends = [];
  for (const gap of gaps) {
    if (gap - starts[starts.length - 1] >= MIN_VARIANT_TIMINGS) {
      ends.push(gap);
      starts.push(gap + 1);
    }
  }
  if (signed.length - starts[starts.length - 1] >= MIN_VARIANT_TIMINGS) {
    ends.push(signed.length);
  } else if (starts.length > ends.length) {
    starts.pop();
  }

  const frameCount = Math.min(starts.length, ends.length);

  // Single sections are valuable for remotes whose first/last section carries
  // a recognizable header. Adjacent windows preserve internal long gaps, which
  // is required by many stateful AC protocols.
  for (let i = 0; i < frameCount; i++) {
    add(`frame-${i + 1}`, abs.slice(starts[i], ends[i]), {
      frame_start: i,
      frame_end: i,
      frame_count: frameCount,
    });
  }

  // Probe windows of 2..4 adjacent frames. Four is enough for common AC remotes
  // while keeping native decoder process count bounded.
  for (let width = 2; width <= Math.min(4, frameCount); width++) {
    for (let i = 0; i + width <= frameCount; i++) {
      const j = i + width - 1;
      add(`frames-${i + 1}-${j + 1}`, abs.slice(starts[i], ends[j]), {
        frame_start: i,
        frame_end: j,
        frame_count: frameCount,
      });
    }
  }

  // Some receivers begin recording inside a repeat/lead-in. Try only even
  // offsets so MARK/SPACE parity is retained. These variants are lower priority.
  for (const offset of [2, 4, 6, 8, 10, 12]) {
    if (abs.length - offset >= MIN_VARIANT_TIMINGS) {
      add(`trim-${offset}`, abs.slice(offset), { trim_offset: offset });
    }
  }

  return {
    variants: out,
    detected_frames: frameCount || 1,
    gap_count: gaps.length,
  };
}

function richness(canonical, state) {
  const src = canonical && typeof canonical === "object" ? canonical : state;
  if (!src || typeof src !== "object") return 0;
  const keys = [
    "power", "mode", "temp", "temperature", "fan", "fanSpeed",
    "swing", "swingV", "swingH"
  ];
  return keys.reduce(
    (count, key) => count + (src[key] !== undefined && src[key] !== null ? 1 : 0),
    0
  );
}

function probeIrtxrxSingle(timings) {
  const t = normalizeTimings(timings);
  if (t.length < 4) {
    return { timings: t.length, registered_protocols: (ir.REGISTERED_PROTOCOLS || []).length, matches: [] };
  }

  const matches = [];
  for (const protocol of ir.REGISTERED_PROTOCOLS || []) {
    try {
      const result = ir.decode(t, { protocol });
      if (!result) continue;

      const info = ir.getProtocolInfo ? ir.getProtocolInfo(protocol) : undefined;
      let canonical;
      try {
        canonical = ir.toCanonical ? ir.toCanonical(protocol, result.state) : undefined;
      } catch (_) {}

      let canEncode = false;
      try {
        canEncode = !!(ir.canEncode && ir.canEncode(protocol));
      } catch (_) {}

      matches.push({
        protocol,
        brand: info?.brand || null,
        type: info?.type || null,
        structured: !!canonical,
        can_encode: canEncode,
        richness: richness(canonical, result.state),
        canonical: safe(canonical || null),
        state: safe(result.state || null),
      });
    } catch (_) {
      // Protocol mismatch is expected.
    }
  }

  matches.sort((a, b) =>
    Number(b.structured) - Number(a.structured) ||
    Number(b.type === "ac") - Number(a.type === "ac") ||
    b.richness - a.richness ||
    Number(b.can_encode) - Number(a.can_encode) ||
    String(a.protocol).localeCompare(String(b.protocol))
  );

  return {
    timings: t.length,
    registered_protocols: (ir.REGISTERED_PROTOCOLS || []).length,
    matches,
  };
}

function aggregateIrtxrx(variantInfo) {
  const groups = new Map();
  for (const variant of variantInfo.variants) {
    const result = probeIrtxrxSingle(variant.timings);
    for (const match of result.matches) {
      const key = String(match.protocol || "").toLowerCase();
      if (!key) continue;
      let row = groups.get(key);
      if (!row) {
        row = { best: null, hits: 0, variants: new Set(), full_hit: false };
        groups.set(key, row);
      }
      row.hits++;
      row.variants.add(variant.label);
      if (variant.full) row.full_hit = true;

      const quality =
        Number(match.structured) * 100 +
        Number(match.type === "ac") * 80 +
        Number(match.richness || 0) * 8 +
        Number(match.can_encode) * 4 +
        Number(variant.full) * 3 +
        Math.min(variant.timings.length / 1000, 2);

      if (!row.best || quality > row.best._quality) {
        row.best = { ...match, _quality: quality, variant: variant.label };
      }
    }
  }

  const matches = [];
  for (const row of groups.values()) {
    if (!row.best) continue;
    // Variant-only generic matches are noisy. Keep them only with repeated
    // evidence, or when the public codec recognized a structured AC state.
    const strongAc = row.best.type === "ac" && row.best.structured;
    if (!row.full_hit && row.variants.size < 2 && !strongAc) continue;
    const { _quality, ...best } = row.best;
    matches.push({
      ...best,
      variant_hits: row.variants.size,
      full_capture_match: row.full_hit,
      evidence_variants: Array.from(row.variants).slice(0, 8),
    });
  }

  matches.sort((a, b) =>
    Number(b.structured) - Number(a.structured) ||
    Number(b.type === "ac") - Number(a.type === "ac") ||
    Number(b.variant_hits || 0) - Number(a.variant_hits || 0) ||
    Number(b.full_capture_match) - Number(a.full_capture_match) ||
    Number(b.richness || 0) - Number(a.richness || 0) ||
    Number(b.can_encode) - Number(a.can_encode) ||
    String(a.protocol).localeCompare(String(b.protocol))
  );

  return {
    timings: variantInfo.variants[0]?.timings?.length || 0,
    registered_protocols: (ir.REGISTERED_PROTOCOLS || []).length,
    variants_tested: variantInfo.variants.length,
    detected_frames: variantInfo.detected_frames,
    matches,
  };
}

function probeIrremoteEsp8266Single(timings) {
  const t = normalizeTimings(timings);
  if (t.length < 4) return { ok:true, coverage:128, match:null };
  const p = spawnSync("/opt/hanjoo/ir8266_probe", [], {
    input: t.join(",") + "\n", encoding:"utf8", timeout:2500, maxBuffer:1024*1024
  });
  if (p.error) return { ok:false, coverage:128, error:String(p.error.message || p.error), match:null };
  if (p.status !== 0) return { ok:false, coverage:128, error:String(p.stderr || `exit ${p.status}`), match:null };
  try { return JSON.parse(p.stdout || "{}"); }
  catch (e) { return { ok:false, coverage:128, error:`invalid native decoder JSON: ${e.message}`, match:null }; }
}

function inferBrandFromProtocol(name) {
  const p = String(name || "").toUpperCase();
  const rules = [
    ["DAIKIN","Daikin"],["PANASONIC","Panasonic"],["LG","LG"],["MITSUBISHI","Mitsubishi"],
    ["SAMSUNG","Samsung"],["GREE","Gree"],["MIDEA","Midea"],["HAIER","Haier"],["TOSHIBA","Toshiba"],
    ["FUJITSU","Fujitsu"],["HITACHI","Hitachi"],["CARRIER","Carrier"],["SHARP","Sharp"],["SANYO","Sanyo"],
    ["WHIRLPOOL","Whirlpool"],["ELECTRA","Electra"],["KELVINATOR","Kelvinator"],["ARGO","Argo"],
    ["COOLIX","Coolix"],["AIRWELL","Airwell"],["NEOCLIMA","Neoclima"],["VESTEL","Vestel"],["TECO","Teco"],
    ["TCL","TCL"],["BOSCH","Bosch"],["YORK","York"],["EUROM","Eurom"],["SONY","Sony"],["NEC","NEC"],
    ["JVC","JVC"],["DENON","Denon"],["RC5","Philips/RC5"],["RC6","Philips/RC6"],["EPSON","Epson"]
  ];
  for (const [token,brand] of rules) if (p.includes(token)) return brand;
  return null;
}

function aggregateIrremoteEsp8266(variantInfo) {
  const groups = new Map();
  const errors = [];

  for (const variant of variantInfo.variants) {
    const result = probeIrremoteEsp8266Single(variant.timings);
    if (!result?.ok && result?.error) errors.push(`${variant.label}: ${result.error}`);
    const match = result?.match;
    if (!match?.protocol) continue;

    match.brand = inferBrandFromProtocol(match.protocol);
    const stateKey = match.ac_state
      ? String(match.state_hex || "")
      : `${String(match.value || "")}:${String(match.address ?? "")}:${String(match.command ?? "")}`;
    const key = `${String(match.protocol).toLowerCase()}|${Number(match.bits || 0)}|${stateKey}`;
    let row = groups.get(key);
    if (!row) {
      row = { best: null, variants: new Set(), full_hit: false };
      groups.set(key, row);
    }
    row.variants.add(variant.label);
    if (variant.full) row.full_hit = true;

    // Native AC recognition is intentionally prioritized. Stateful protocols
    // carry far more identifying structure than a generic short consumer frame.
    const quality =
      Number(match.ac_state) * 1000 +
      Number(match.bits || 0) * 2 +
      Number(variant.full) * 25 +
      Math.min(variant.timings.length, 2000) / 100;

    if (!row.best || quality > row.best._quality) {
      row.best = {
        ...match,
        _quality: quality,
        variant: variant.label,
        timing_count: variant.timings.length,
      };
    }
  }

  const candidates = [];
  for (const row of groups.values()) {
    if (!row.best) continue;
    const { _quality, ...best } = row.best;
    // A single segmented hit is accepted for stateful AC protocols because the
    // native decoder validates their protocol structure/checksums. Generic
    // non-AC segmented hits need repeated evidence unless the full capture hit.
    if (!best.ac_state && !row.full_hit && row.variants.size < 2) continue;
    candidates.push({
      ...best,
      variant_hits: row.variants.size,
      full_capture_match: row.full_hit,
      evidence_variants: Array.from(row.variants).slice(0, 8),
    });
  }

  candidates.sort((a, b) =>
    Number(b.ac_state) - Number(a.ac_state) ||
    Number(b.variant_hits || 0) - Number(a.variant_hits || 0) ||
    Number(b.full_capture_match) - Number(a.full_capture_match) ||
    Number(b.bits || 0) - Number(a.bits || 0) ||
    Number(b.timing_count || 0) - Number(a.timing_count || 0)
  );

  return {
    ok: errors.length < variantInfo.variants.length,
    coverage: 128,
    match: candidates[0] || null,
    candidates: candidates.slice(0, 12),
    variants_tested: variantInfo.variants.length,
    detected_frames: variantInfo.detected_frames,
    gap_count: variantInfo.gap_count,
    errors: errors.slice(0, 4),
  };
}

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data),
  });
  res.end(data);
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, {
      ok: true,
      service: "hanjoo-public-codec-probe",
      version: VERSION,
      irtxrx_protocols: (ir.REGISTERED_PROTOCOLS || []).length,
      irremoteesp8266_protocols: 128,
      recognition_coverage: 128,
      multi_frame_probe: true,
    });
  }

  const isProbe = req.method === "POST" && (req.url === "/v1/probe" || req.url === "/v1/probe-all");
  if (!isProbe) return send(res, 404, { error:"not_found" });

  let raw = "";
  req.setEncoding("utf8");
  req.on("data", chunk => {
    raw += chunk;
    if (raw.length > 4_000_000) req.destroy();
  });
  req.on("end", () => {
    try {
      const payload = JSON.parse(raw || "{}");
      const timings = payload.timings || [];

      // Keep /v1/probe simple/backward-compatible for callers that explicitly
      // want one exact irtxrx pass.
      if (req.url === "/v1/probe") {
        return send(res, 200, probeIrtxrxSingle(timings));
      }

      const variantInfo = buildTimingVariants(timings);
      const irtxrx = aggregateIrtxrx(variantInfo);
      const upstream = aggregateIrremoteEsp8266(variantInfo);

      return send(res, 200, {
        timings: normalizeTimings(timings).length,
        recognition_coverage: 128,
        detected_frames: variantInfo.detected_frames,
        variants_tested: variantInfo.variants.length,
        irtxrx,
        irremoteesp8266: upstream,
      });
    } catch (err) {
      return send(res, 400, { error: String(err?.message || err) });
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `[HanJoo IR Core] exhaustive multi-frame codec probe listening on 0.0.0.0:${PORT}; protocols=${(ir.REGISTERED_PROTOCOLS || []).length}`
  );
});
