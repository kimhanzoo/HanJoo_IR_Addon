"use strict";

const http = require("node:http");
const { spawnSync } = require("node:child_process");
const { createRequire } = require("node:module");
const requireFromRuntime = createRequire("/opt/hanjoo/package.json");
const ir = requireFromRuntime("irtxrx");

const PORT = Number(process.argv[2] || 8101);
const VERSION = process.env.HANJOO_VERSION || "0.6.16";
const MAX_TIMINGS = 20000;
const MAX_VARIANTS = 8;
const FRAME_GAP_US = 6500;
const LONG_AC_GAP_US = 18000;
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
    const signed = raw < 0 ? -rounded : rounded;

    // Preserve receiver mark/space polarity. If a transport ever produces
    // adjacent timings with the same polarity, merge them rather than shifting
    // the mark/space phase seen by native decoders.
    if (out.length && Math.sign(out[out.length - 1]) === Math.sign(signed)) {
      out[out.length - 1] += signed;
    } else {
      out.push(signed);
    }
  }

  // HA captures may include a leading idle-space. IRremoteESP8266 rawbuf[0]
  // already receives a synthetic pre-gap, so the first payload duration must
  // be a mark. Dropping only leading spaces keeps real inter-frame gaps intact.
  while (out.length && out[0] < 0) out.shift();
  return out;
}
function normalizeTimings(values) { return normalizeSignedTimings(values).map(Math.abs); }
function variantKey(values) { return values.join(","); }

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

  add("full", abs, { full:true });

  const gaps = [];
  let longGapCount = 0;
  for (let i = 1; i < signed.length - 1; i++) {
    const isSpace = signed[i] < 0 || (i % 2 === 1);
    if (!isSpace) continue;
    const gap = Math.abs(signed[i]);
    if (gap >= FRAME_GAP_US) gaps.push(i);
    if (gap >= LONG_AC_GAP_US) longGapCount++;
  }

  const starts = [0], ends = [];
  for (const gap of gaps) {
    if (gap - starts[starts.length - 1] >= MIN_VARIANT_TIMINGS) {
      ends.push(gap);
      starts.push(gap + 1);
    }
  }
  if (signed.length - starts[starts.length - 1] >= MIN_VARIANT_TIMINGS) ends.push(signed.length);
  else if (starts.length > ends.length) starts.pop();
  const frameCount = Math.min(starts.length, ends.length);

  // With idle≈50ms, long A/C captures now preserve real inter-section gaps.
  // Prefer the exact full press and a small set of section/trim fallbacks.
  // Avoid the old combinatorial 20+ variant fan-out that could OOM/kill the
  // sidecar while three guided captures were being analysed.
  if (longGapCount > 0 && abs.length > 220) {
    // A modern 50 ms receiver capture already contains the complete stateful
    // A/C press. Partial-section variants are both expensive and more prone to
    // false positives on checksum-less protocols. Only try small even trims to
    // recover from an occasional leading pair/noise while preserving phase.
    for (const offset of [2,4,6]) {
      if (abs.length - offset >= MIN_VARIANT_TIMINGS) add(`trim-${offset}`, abs.slice(offset), { trim_offset:offset });
    }
  } else {
    for (let i = 0; i < frameCount; i++) add(`frame-${i+1}`, abs.slice(starts[i], ends[i]), { frame_start:i, frame_end:i });
    for (let width = 2; width <= Math.min(3, frameCount); width++) {
      for (let i = 0; i + width <= frameCount; i++) {
        const j = i + width - 1;
        add(`frames-${i+1}-${j+1}`, abs.slice(starts[i], ends[j]), { frame_start:i, frame_end:j });
      }
    }
    for (const offset of [2,4,6]) {
      if (abs.length - offset >= MIN_VARIANT_TIMINGS) add(`trim-${offset}`, abs.slice(offset), { trim_offset:offset });
    }
  }
  return { variants:out, detected_frames:frameCount || 1, gap_count:gaps.length, long_gap_count:longGapCount };
}

function richness(canonical, state) {
  const src = canonical && typeof canonical === "object" ? canonical : state;
  if (!src || typeof src !== "object") return 0;
  return ["power","mode","temp","temperature","degrees","fan","fanSpeed","fanspeed","swing","swingV","swingH","swingv","swingh"]
    .reduce((n,k)=>n + (src[k] !== undefined && src[k] !== null ? 1 : 0), 0);
}

function probeIrtxrxSingle(timings) {
  const t = normalizeTimings(timings);
  const matches = [];
  if (t.length < 4) return { timings:t.length, registered_protocols:(ir.REGISTERED_PROTOCOLS||[]).length, matches };
  for (const protocol of ir.REGISTERED_PROTOCOLS || []) {
    try {
      const result = ir.decode(t, { protocol });
      if (!result) continue;
      const info = ir.getProtocolInfo ? ir.getProtocolInfo(protocol) : undefined;
      let canonical; try { canonical = ir.toCanonical ? ir.toCanonical(protocol, result.state) : undefined; } catch (_) {}
      let canEncode = false; try { canEncode = !!(ir.canEncode && ir.canEncode(protocol)); } catch (_) {}
      matches.push({ protocol, brand:info?.brand||null, type:info?.type||null, structured:!!canonical,
        can_encode:canEncode, richness:richness(canonical,result.state), canonical:safe(canonical||null), state:safe(result.state||null), source:"irtxrx" });
    } catch (_) {}
  }
  return { timings:t.length, registered_protocols:(ir.REGISTERED_PROTOCOLS||[]).length, matches };
}

function aggregateIrtxrx(info) {
  const groups = new Map();
  for (const variant of info.variants) {
    for (const match of probeIrtxrxSingle(variant.timings).matches) {
      const key = String(match.protocol||"").toLowerCase(); if (!key) continue;
      let row = groups.get(key); if (!row) { row={best:null,variants:new Set(),full:false}; groups.set(key,row); }
      row.variants.add(variant.label); if (variant.full) row.full=true;
      const q = Number(match.structured)*100 + Number(match.type==="ac")*80 + Number(match.richness||0)*8 + Number(match.can_encode)*4 + Number(variant.full)*3;
      if (!row.best || q > row.best.q) row.best={...match,q,variant:variant.label};
    }
  }
  const matches=[];
  for (const row of groups.values()) {
    if (!row.best) continue;
    const strongAc = row.best.type === "ac" && row.best.structured;
    if (!row.full && row.variants.size < 2 && !strongAc) continue;
    const {q,...best}=row.best;
    matches.push({...best,variant_hits:row.variants.size,full_capture_match:row.full,evidence_variants:[...row.variants].slice(0,8)});
  }
  matches.sort((a,b)=>Number(b.structured)-Number(a.structured)||Number(b.type==="ac")-Number(a.type==="ac")||Number(b.variant_hits||0)-Number(a.variant_hits||0));
  return { timings:info.variants[0]?.timings?.length||0, registered_protocols:(ir.REGISTERED_PROTOCOLS||[]).length, variants_tested:info.variants.length, detected_frames:info.detected_frames, matches };
}

function probeNativeSingle(timings) {
  const t = normalizeTimings(timings);
  if (t.length < 4) return {ok:true,coverage:128,match:null};
  const p = spawnSync("/opt/hanjoo/ir8266_probe", [], {input:t.join(",")+"\n",encoding:"utf8",timeout:1500,maxBuffer:1024*1024});
  if (p.error) return {ok:false,coverage:128,error:String(p.error.message||p.error),match:null};
  if (p.status !== 0) return {ok:false,coverage:128,error:String(p.stderr||`exit ${p.status}`),match:null};
  try { return JSON.parse(p.stdout||"{}"); } catch(e) { return {ok:false,coverage:128,error:`invalid native decoder JSON: ${e.message}`,match:null}; }
}

function inferBrand(name) {
  const p=String(name||"").toUpperCase();
  const rules=[["DAIKIN","Daikin"],["PANASONIC","Panasonic"],["MITSUBISHI","Mitsubishi"],["FUJITSU","Fujitsu"],["HITACHI","Hitachi"],["SAMSUNG","Samsung"],["LG","LG"],["GREE","Gree"],["MIDEA","Midea"],["HAIER","Haier"],["TOSHIBA","Toshiba"],["CARRIER","Carrier"],["SHARP","Sharp"],["SANYO","Sanyo"],["WHIRLPOOL","Whirlpool"],["COOLIX","Coolix"],["AIRWELL","Airwell"],["TCL","TCL"],["SONY","Sony"],["NEC","NEC"],["JVC","JVC"],["DENON","Denon"],["RC5","Philips/RC5"],["RC6","Philips/RC6"]];
  for (const [token,brand] of rules) if (p.includes(token)) return brand;
  return null;
}

function aggregateNative(info) {
  const groups=new Map(), errors=[];
  for (const variant of info.variants) {
    const result=probeNativeSingle(variant.timings);
    if (!result?.ok && result?.error) errors.push(`${variant.label}: ${result.error}`);
    const m=result?.match; if (!m?.protocol) continue;
    m.brand=inferBrand(m.protocol);
    const stateKey=m.ac_state?String(m.state_hex||""):`${m.value||""}:${m.address??""}:${m.command??""}`;
    const key=`${String(m.protocol).toLowerCase()}|${Number(m.bits||0)}|${stateKey}`;
    let row=groups.get(key); if(!row){row={best:null,variants:new Set(),full:false};groups.set(key,row);} row.variants.add(variant.label); if(variant.full)row.full=true;
    const q=Number(m.ac_state)*1000+Number(m.bits||0)*2+Number(variant.full)*25+Math.min(variant.timings.length,2000)/100;
    if(!row.best||q>row.best.q)row.best={...m,q,variant:variant.label,timing_count:variant.timings.length};

    // A full-capture native A/C match has already passed the dedicated decoder
    // structure/checksum validation. Stop probing weaker variants immediately.
    if (variant.full && m.ac_state) break;
  }

  const candidates=[];
  const diagnostics=[];
  for(const row of groups.values()){
    if(!row.best)continue; const {q,...best}=row.best;
    const decorated={...best,variant_hits:row.variants.size,full_capture_match:row.full,evidence_variants:[...row.variants].slice(0,8)};
    diagnostics.push(decorated);
    if(!best.ac_state && info.detected_frames>1) continue;
    if(!best.ac_state && Number(best.tolerance||25)>40) continue;
    if(!best.ac_state && !row.full && row.variants.size<2) continue;
    candidates.push(decorated);
  }
  candidates.sort((a,b)=>Number(b.ac_state)-Number(a.ac_state)||Number(b.variant_hits||0)-Number(a.variant_hits||0)||Number(b.full_capture_match)-Number(a.full_capture_match)||Number(b.bits||0)-Number(a.bits||0));
  diagnostics.sort((a,b)=>Number(b.ac_state)-Number(a.ac_state)||Number(b.variant_hits||0)-Number(a.variant_hits||0)||Number(b.bits||0)-Number(a.bits||0));
  return {ok:errors.length<info.variants.length,coverage:128,match:candidates[0]||null,candidates:candidates.slice(0,12),diagnostics:diagnostics.slice(0,16),variants_tested:info.variants.length,detected_frames:info.detected_frames,gap_count:info.gap_count,errors:errors.slice(0,4)};
}

function nativeToBrainMatch(m) {
  if (!m?.protocol) return null;
  const ac = !!m.ac_state;
  const hvac = ac && m.hvac_state && typeof m.hvac_state === "object" ? safe(m.hvac_state) : null;
  const state = ac ? { state_hex:m.state_hex||null, bits:m.bits||0, hvac_state:hvac } : { value:m.value||null, address:m.address, command:m.command, bits:m.bits||0 };
  return { protocol:m.protocol, brand:m.brand||inferBrand(m.protocol), type:ac?"ac":"remote", structured:ac, can_encode:false,
    richness:ac?Math.max(8,richness(hvac,hvac)):2, canonical:hvac, state, source:"irremoteesp8266", native_decoder:true,
    ac_state:ac, bits:m.bits||0, state_hex:m.state_hex||null, hvac_state:hvac, value:m.value||null, address:m.address,
    command:m.command, tolerance:m.tolerance, decoder_path:m.decoder_path||null, variant:m.variant||null,
    variant_hits:m.variant_hits||1, full_capture_match:!!m.full_capture_match, evidence_variants:m.evidence_variants||[] };
}

function mergeForBrain(irtxrx, native) {
  const all=[];
  for (const m of native.candidates||[]) { const x=nativeToBrainMatch(m); if(x) all.push(x); }
  for (const m of irtxrx.matches||[]) all.push(m);
  const best=new Map();
  for(const m of all){
    const key=String(m.protocol||"").toLowerCase(); if(!key)continue;
    const score=Number(m.native_decoder&&m.type==="ac")*2000+Number(m.type==="ac")*700+Number(m.structured)*300+Number(m.native_decoder)*100+Number(m.variant_hits||0)*10+Number(m.richness||0);
    if(!best.has(key)||score>best.get(key).score)best.set(key,{score,m});
  }
  return [...best.values()].sort((a,b)=>b.score-a.score).map(x=>x.m);
}

function runPipeline(timings){
  const variantInfo=buildTimingVariants(timings);
  const native=aggregateNative(variantInfo);

  // A full-capture stateful native match is the strongest evidence we have:
  // dedicated IRremoteESP8266 decoders validate the protocol structure and,
  // where defined, checksum. Avoid scanning ~90 public codecs again in this
  // case. This lowers CPU/RAM use and removes weak competing family guesses.
  const nativeFullAc = !!(native.match?.ac_state && native.match?.full_capture_match);
  const irtxrx = nativeFullAc
    ? {
        timings:variantInfo.variants[0]?.timings?.length||0,
        registered_protocols:(ir.REGISTERED_PROTOCOLS||[]).length,
        variants_tested:0,
        detected_frames:variantInfo.detected_frames,
        matches:[],
        skipped:"native_full_ac_confirmed"
      }
    : aggregateIrtxrx(variantInfo);
  const matches=mergeForBrain(irtxrx,native);
  return {variantInfo,irtxrx,native,matches};
}

function send(res,status,body){const data=JSON.stringify(body);res.writeHead(status,{"content-type":"application/json; charset=utf-8","content-length":Buffer.byteLength(data)});res.end(data);}

const server=http.createServer((req,res)=>{
  if(req.method==="GET"&&req.url==="/health")return send(res,200,{ok:true,service:"hanjoo-public-codec-probe",version:VERSION,irtxrx_protocols:(ir.REGISTERED_PROTOCOLS||[]).length,irremoteesp8266_protocols:128,recognition_coverage:128,multi_frame_probe:true,native_brain_bridge:true,tasmota_style_ac:true,hvac_state_bridge:true,resource_guard:true,signed_input:true,native_short_circuit:true});
  const isProbe=req.method==="POST"&&(req.url==="/v1/probe"||req.url==="/v1/probe-all");
  if(!isProbe)return send(res,404,{error:"not_found"});
  let raw="";req.setEncoding("utf8");req.on("data",c=>{raw+=c;if(raw.length>4_000_000)req.destroy();});
  req.on("end",()=>{
    try{
      const payload=JSON.parse(raw||"{}");
      const timings=payload.timings||[];
      const p=runPipeline(timings);
      if(req.url==="/v1/probe")return send(res,200,{timings:normalizeTimings(timings).length,registered_protocols:(ir.REGISTERED_PROTOCOLS||[]).length,variants_tested:p.variantInfo.variants.length,detected_frames:p.variantInfo.detected_frames,matches:p.matches,native_match:p.native.match||null});
      return send(res,200,{timings:normalizeTimings(timings).length,recognition_coverage:128,detected_frames:p.variantInfo.detected_frames,variants_tested:p.variantInfo.variants.length,matches:p.matches,irtxrx:p.irtxrx,irremoteesp8266:p.native});
    }catch(err){return send(res,400,{error:String(err?.message||err)});}
  });
});
server.listen(PORT,"0.0.0.0",()=>console.log(`[HanJoo IR Core] resource-guarded native AC + public probe listening on 0.0.0.0:${PORT}; protocols=${(ir.REGISTERED_PROTOCOLS||[]).length}`));
