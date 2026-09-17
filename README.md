# HanJoo IR for Home Assistant

**HanJoo IR** turns Home Assistant into a practical IR remote manager that combines multiple protocol engines and community libraries instead of relying on a single database. The Manager correlates evidence from **HanJoo Core/Brain, IRremoteESP8266, irtxrx, SmartIR, Flipper-IRDB, saved profiles, and learned RAW signals** to identify the best-supported device/profile while keeping a manual-learning fallback.

## Highlights

- Multi-source IR recognition and profile matching.
- Native Home Assistant entities such as `climate`, `media_player`, `fan`, `remote`, and buttons where appropriate.
- Runtime learning/sending through ESPHome 2026.x infrared proxy entities; after the IR bridge is flashed, normal device management happens in HanJoo IR Manager.
- One-install model: install the **HanJoo IR Core add-on** and it installs/updates the thin Manager integration automatically. HACS is optional.
- Local-first. Learned codes, device configuration, and routing remain in Home Assistant storage so they follow Home Assistant backup/restore.
- Supported add-on architectures: **Intel/AMD x86-64 (`amd64`)** and **64-bit ARM (`aarch64`)**.

## Install in Home Assistant

1. Open **Settings → Add-ons → Add-on Store**.
2. Open the menu **⋮ → Repositories**.
3. Add this repository:

   `https://github.com/kimhanzoo/HanJoo_IR_Addon`

4. Install **HanJoo IR Core** and start it.
5. The add-on automatically installs/updates **HanJoo IR Manager** under `/config/custom_components/hanjoo_ir`.
6. After the first install or whenever the Manager version changes, restart **Home Assistant Core once**.
7. Open **HanJoo IR** from the Home Assistant sidebar and select your IR transmitter/receiver entities.

For developers or users who want HACS to own the integration, the separate Manager repository is still available; disable `install_manager` in the add-on options first.

## Hardware

You only need an inexpensive IR bridge. Two common choices are:

- an **ESP32/ESP8266-compatible board** plus an IR LED/transmitter stage and a 38 kHz IR receiver; or
- a low-cost **Tuya IR blaster using BK7231N** that is compatible with ESPHome/LibreTiny and can be reflashed. Hardware revisions vary, so verify the board/chip/pins before flashing.

### Recommended ESPHome configuration

For broad protocol recognition, especially stateful air-conditioner remotes, HanJoo follows the capture strategy used by IRremoteESP8266's `IRrecvDumpV2` and Tasmota: preserve a complete physical button press instead of cutting at 10 ms. Many A/C protocols contain 20–40+ ms gaps between packets.

```yaml
remote_transmitter:
  id: ir_tx
  pin: 7
  carrier_duty_percent: 50%

remote_receiver:
  id: ir_rx
  pin:
    number: 8
    inverted: true
    mode:
      input: true
      pullup: true

  # Keep normal captures strict. HanJoo's Core may relax decoding internally,
  # but loose 50-55% receiver tolerance can create false protocol matches.
  tolerance: 25%
  filter: 50us

  # Important for A/C remotes: keep multi-packet state messages together.
  idle: 50ms
  buffer_size: 4kb

  # Optional for debugging; HanJoo IR Manager does not require this log.
  dump: all

# ESPHome 2026.x native IR proxy. Home Assistant creates runtime infrared
# entities, so learning/sending new codes does not require recompiling firmware.
infrared:
  - platform: ir_rf_proxy
    name: IR Transmitter
    remote_transmitter_id: ir_tx

  - platform: ir_rf_proxy
    name: IR Receiver
    receiver_frequency: 38kHz
    remote_receiver_id: ir_rx
```

**Change GPIO 7 and GPIO 8 to match your hardware.** If an existing HanJoo bridge still uses `idle: 10ms`, reflash it once with the settings above. After that, normal learning, search, device creation, routing, testing, and management are handled by HanJoo IR Manager without further firmware changes.

### Does the 50 ms capture affect normal remotes or manual learning?

- **Search by brand/model:** no. Search uses the protocol/profile catalogs, SmartIR, Flipper-IRDB, and saved profiles; receiver `idle` does not change those results.
- **Manual learning:** remains supported. The learned RAW signal may contain a longer final/inter-packet silence, but HanJoo stores the complete timing sequence and replays it normally.
- **TV/audio/simple remotes:** they can still be decoded. A longer `idle` can occasionally capture repeated frames when a button is held; HanJoo treats repetitions as one physical capture and deduplicates evidence.
- **Air conditioners:** benefit the most because full multi-packet state messages reach the native decoder intact.

## Recognition priority

Typical flow in 0.6.9:

`Full physical capture → IRremoteESP8266 native A/C decode → IRAc normalized HVAC state → HanJoo Brain/Fusion → irtxrx → SmartIR / Flipper-IRDB → Saved/Learned Custom`

The native A/C path is deliberately preferred for stateful protocols such as Daikin, Panasonic, Mitsubishi, Fujitsu, Gree, Midea, Hitachi, Haier, Toshiba, Samsung A/C and others. When IRremoteESP8266 recognizes an A/C state, HanJoo also passes a normalized HVAC state (power, mode, temperature, fan, swing and related fields) into Brain instead of only a raw hex blob.

Generic RC/TV decoders are not allowed to automatically claim a multi-frame A/C capture when no A/C decoder matched; this reduces false positives such as RC5/RC6 on long climate codes. Multi-frame splitting remains only as a compatibility fallback for old bridges that still cut captures early.

The Fusion layer can compare several sources for the same physical remote instead of trusting the first protocol guess. Automatic recommendations only pass when the evidence clears safety/confidence checks; otherwise HanJoo keeps the user in search/manual-learning mode.

## Updating

Every release bumps the add-on version. Home Assistant then shows **Update** in the Add-on page. No uninstall/reinstall is required.

## Recognition workflow

When HanJoo recognizes only a wire/protocol family, you can replay the captured RAW command immediately to verify the receive/transmit path. HanJoo then uses detected brand/model hints to list testable Protocol Engine, saved, SmartIR and Flipper-IRDB models directly in the identification screen. A RAW replay success does not falsely certify an exact model; exact profiles are confirmed separately by Test before installation.
