#include <algorithm>
#include <cstdint>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include "IRac.h"
#include "IRrecv.h"
#include "IRremoteESP8266.h"
#include "IRutils.h"

static std::vector<uint16_t> parse_csv(const std::string &line) {
  std::vector<uint16_t> out;
  out.push_back(static_cast<uint16_t>(50000U / kRawTick));
  std::stringstream ss(line); std::string item;
  while (std::getline(ss, item, ',')) {
    if (item.empty()) continue;
    long long v = std::llabs(std::strtoll(item.c_str(), nullptr, 10));
    if (v <= 0) continue;
    uint32_t ticks = static_cast<uint32_t>(v / kRawTick);
    if (!ticks) ticks = 1;
    if (ticks > 65535U) ticks = 65535U;
    out.push_back(static_cast<uint16_t>(ticks));
    if (out.size() >= 20001) break;
  }
  return out;
}

static std::string esc(const std::string &s) {
  std::string o; for (char c : s) { if (c=='\\'||c=='"') o+='\\'; o+=c; } return o;
}

static std::string hex64(uint64_t v) {
  std::ostringstream o; o << "0x" << std::uppercase << std::hex << v; return o.str();
}

static void emit_hvac_state(std::ostringstream &out, const decode_results &result) {
  stdAc::state_t state;
  if (!IRAcUtils::decodeToState(&result, &state)) {
    out << "null";
    return;
  }
  out << "{"
      << "\"protocol\":" << static_cast<int>(state.protocol) << ","
      << "\"model\":" << static_cast<int>(state.model) << ","
      << "\"command\":" << static_cast<int>(state.command) << ","
      << "\"power\":" << (state.power ? "true" : "false") << ","
      << "\"mode\":" << static_cast<int>(state.mode) << ","
      << "\"celsius\":" << (state.celsius ? "true" : "false") << ","
      << "\"degrees\":" << state.degrees << ","
      << "\"fanspeed\":" << static_cast<int>(state.fanspeed) << ","
      << "\"swingv\":" << static_cast<int>(state.swingv) << ","
      << "\"swingh\":" << static_cast<int>(state.swingh) << ","
      << "\"quiet\":" << (state.quiet ? "true" : "false") << ","
      << "\"turbo\":" << (state.turbo ? "true" : "false") << ","
      << "\"econo\":" << (state.econo ? "true" : "false") << ","
      << "\"light\":" << (state.light ? "true" : "false") << ","
      << "\"filter\":" << (state.filter ? "true" : "false") << ","
      << "\"clean\":" << (state.clean ? "true" : "false") << ","
      << "\"beep\":" << (state.beep ? "true" : "false") << ","
      << "\"sleep\":" << state.sleep << ","
      << "\"clock\":" << state.clock
      << "}";
}

static void emit_match(const decode_results &result, uint8_t tolerance,
                       const char *path) {
  std::string protocol = typeToString(result.decode_type);
  bool ac = hasACState(result.decode_type);
  std::ostringstream out;
  out << "{\"ok\":true,\"coverage\":128,\"match\":{"
      << "\"protocol\":\"" << esc(protocol) << "\","
      << "\"type_id\":" << static_cast<int>(result.decode_type) << ","
      << "\"bits\":" << result.bits << ","
      << "\"ac_state\":" << (ac?"true":"false") << ","
      << "\"repeat\":" << (result.repeat?"true":"false") << ","
      << "\"tolerance\":" << static_cast<int>(tolerance) << ","
      << "\"decoder_path\":\"" << path << "\",";
  if (ac) {
    size_t bytes = std::min<size_t>((result.bits+7)/8, kStateSizeMax);
    std::ostringstream state; state << std::uppercase << std::hex << std::setfill('0');
    for (size_t i=0;i<bytes;++i) state << std::setw(2) << static_cast<int>(result.state[i]);
    out << "\"state_hex\":\"" << state.str() << "\",\"hvac_state\":";
    emit_hvac_state(out, result);
  } else {
    out << "\"value\":\"" << hex64(result.value) << "\",\"address\":" << result.address
        << ",\"command\":" << result.command;
  }
  out << "}}\n";
  std::cout << out.str();
}

static decode_results fresh_result(const decode_results &base) {
  decode_results r = base;
  r.decode_type = UNKNOWN;
  r.bits = 0;
  r.value = 0;
  r.address = 0;
  r.command = 0;
  r.repeat = false;
  return r;
}

static bool try_stateful_ac(IRrecv &receiver, const decode_results &base,
                            decode_results *matched) {
#define TRY_AC(call) do { decode_results r = fresh_result(base); if (call) { *matched = r; return true; } } while (0)

  // Follow the same principle used by IRrecvDump/Tasmota: preserve the whole
  // climate-state capture and prefer the dedicated AC decoders. Generic RC/TV
  // protocols are only a fallback after the climate decoders fail.
#if DECODE_DAIKIN
  TRY_AC(receiver.decodeDaikin(&r));
#endif
#if DECODE_DAIKIN2
  TRY_AC(receiver.decodeDaikin2(&r));
#endif
#if DECODE_DAIKIN64
  TRY_AC(receiver.decodeDaikin64(&r));
#endif
#if DECODE_DAIKIN128
  TRY_AC(receiver.decodeDaikin128(&r));
#endif
#if DECODE_DAIKIN152
  TRY_AC(receiver.decodeDaikin152(&r));
#endif
#if DECODE_DAIKIN160
  TRY_AC(receiver.decodeDaikin160(&r));
#endif
#if DECODE_DAIKIN176
  TRY_AC(receiver.decodeDaikin176(&r));
#endif
#if DECODE_DAIKIN200
  TRY_AC(receiver.decodeDaikin200(&r));
#endif
#if DECODE_DAIKIN216
  TRY_AC(receiver.decodeDaikin216(&r));
#endif
#if DECODE_DAIKIN312
  TRY_AC(receiver.decodeDaikin312(&r));
#endif
#if DECODE_PANASONIC_AC
  TRY_AC(receiver.decodePanasonicAC(&r));
  TRY_AC(receiver.decodePanasonicAC(&r, kStartOffset, kPanasonicAcShortBits));
#endif
#if DECODE_PANASONIC_AC32
  TRY_AC(receiver.decodePanasonicAC32(&r));
#endif
#if DECODE_MITSUBISHI_AC
  TRY_AC(receiver.decodeMitsubishiAC(&r));
#endif
#if DECODE_MITSUBISHI112
  TRY_AC(receiver.decodeMitsubishi112(&r));
#endif
#if DECODE_MITSUBISHI136
  TRY_AC(receiver.decodeMitsubishi136(&r));
#endif
#if DECODE_MITSUBISHIHEAVY
  TRY_AC(receiver.decodeMitsubishiHeavy(&r));
#endif
#if DECODE_FUJITSU_AC
  TRY_AC(receiver.decodeFujitsuAC(&r));
#endif
#if DECODE_GREE
  TRY_AC(receiver.decodeGree(&r));
#endif
#if DECODE_MIDEA
  TRY_AC(receiver.decodeMidea(&r));
#endif
#if DECODE_TOSHIBA_AC
  TRY_AC(receiver.decodeToshibaAC(&r));
#endif
#if DECODE_SAMSUNG_AC
  TRY_AC(receiver.decodeSamsungAC(&r));
#endif
#if DECODE_SHARP_AC
  TRY_AC(receiver.decodeSharpAc(&r));
#endif
#if DECODE_KELVINATOR
  TRY_AC(receiver.decodeKelvinator(&r));
#endif
#if DECODE_SANYO_AC
  TRY_AC(receiver.decodeSanyoAc(&r));
#endif
#if DECODE_SANYO_AC88
  TRY_AC(receiver.decodeSanyoAc88(&r));
#endif
#if DECODE_SANYO_AC152
  TRY_AC(receiver.decodeSanyoAc152(&r));
#endif
#if DECODE_HAIER_AC
  TRY_AC(receiver.decodeHaierAC(&r));
#endif
#if DECODE_HAIER_AC_YRW02
  TRY_AC(receiver.decodeHaierACYRW02(&r));
#endif
#if DECODE_HAIER_AC160
  TRY_AC(receiver.decodeHaierAC160(&r));
#endif
#if DECODE_HAIER_AC176
  TRY_AC(receiver.decodeHaierAC176(&r));
#endif
#if (DECODE_HITACHI_AC || DECODE_HITACHI_AC2 || DECODE_HITACHI_AC264 || DECODE_HITACHI_AC344)
  TRY_AC(receiver.decodeHitachiAC(&r));
#endif
#if DECODE_HITACHI_AC1
  TRY_AC(receiver.decodeHitachiAC1(&r));
#endif
#if DECODE_HITACHI_AC3
  TRY_AC(receiver.decodeHitachiAc3(&r));
#endif
#if DECODE_HITACHI_AC296
  TRY_AC(receiver.decodeHitachiAc296(&r));
#endif
#if DECODE_HITACHI_AC424
  TRY_AC(receiver.decodeHitachiAc424(&r));
#endif
#if DECODE_WHIRLPOOL_AC
  TRY_AC(receiver.decodeWhirlpoolAC(&r));
#endif
#if DECODE_ELECTRA_AC
  TRY_AC(receiver.decodeElectraAC(&r));
#endif
#if DECODE_VESTEL_AC
  TRY_AC(receiver.decodeVestelAc(&r));
#endif
#if DECODE_NEOCLIMA
  TRY_AC(receiver.decodeNeoclima(&r));
#endif
#if DECODE_AIRWELL
  TRY_AC(receiver.decodeAirwell(&r));
#endif
#if DECODE_DELONGHI_AC
  TRY_AC(receiver.decodeDelonghiAc(&r));
#endif
#if DECODE_TECHNIBEL_AC
  TRY_AC(receiver.decodeTechnibelAc(&r));
#endif
#if DECODE_CORONA_AC
  TRY_AC(receiver.decodeCoronaAc(&r));
#endif
#if DECODE_MIRAGE
  TRY_AC(receiver.decodeMirage(&r));
#endif
#if DECODE_ECOCLIM
  TRY_AC(receiver.decodeEcoclim(&r));
#endif
#if DECODE_TEKNOPOINT
  TRY_AC(receiver.decodeTeknopoint(&r));
#endif

#undef TRY_AC
  return false;
}

int main() {
  std::string line; if (!std::getline(std::cin, line)) return 2;
  auto raw = parse_csv(line);
  if (raw.size() < 5) {
    std::cout << "{\"ok\":false,\"match\":null,\"coverage\":128}\n";
    return 0;
  }

  decode_results base;
  base.rawbuf = raw.data();
  base.rawlen = static_cast<uint16_t>(raw.size());
  base.overflow = false;

  // IRremoteESP8266 and Tasmota normally use about 25% tolerance. Relax only
  // moderately for automatic recognition; very loose 50-55% matching caused
  // false RC5/RC6/NEC classifications on long climate captures.
  const uint8_t tolerances[] = {25, 30, 35, 40};
  for (uint8_t tolerance : tolerances) {
    IRrecv receiver(0, static_cast<uint16_t>(std::min<size_t>(raw.size()+8, 65535)));
    receiver.setTolerance(tolerance);

    decode_results ac_result;
    if (try_stateful_ac(receiver, base, &ac_result) && ac_result.decode_type != UNKNOWN) {
      emit_match(ac_result, tolerance, "ac_first");
      return 0;
    }

    // Long captures with multiple packets are much more likely to be climate
    // remotes than RC5/RC6-style consumer frames. Do not let a generic decoder
    // claim a tiny prefix of such a capture. The sidecar will still keep RAW and
    // irtxrx evidence as fallbacks.
    if (raw.size() > 260) continue;

    decode_results generic = fresh_result(base);
    bool ok = receiver.decode(&generic, nullptr, 12, 0);
    if (ok && generic.decode_type != UNKNOWN) {
      emit_match(generic, tolerance, "generic");
      return 0;
    }

#if DECODE_NEC
    // Desktop/unit-test builds occasionally miss a repeated NEC burst through
    // the umbrella decode() dispatcher even though the dedicated decoder can
    // decode the supplied rawbuf directly. Keep this as a strict fallback so
    // NEC/NECext consumer remotes still benefit from IRremoteESP8266's own
    // checksum/address/command parsing.
    generic = fresh_result(base);
    if (receiver.decodeNEC(&generic, kStartOffset, kNECBits, true)) {
      emit_match(generic, tolerance, "generic_nec_strict");
      return 0;
    }
#endif
  }

  std::cout << "{\"ok\":true,\"match\":null,\"coverage\":128}\n";
  return 0;
}
