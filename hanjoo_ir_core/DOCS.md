# HanJoo IR Core

HanJoo IR Core is the local protocol engine used by **HanJoo IR Manager**. It performs IR protocol generation, decoding and local remote identification so the Manager can work without depending on an online service for normal control.

## What it does

- **Local remote identification** from captured IR signals.
- **Broad protocol recognition** using a structured `irtxrx` codec layer plus a native IRremoteESP8266 recognition helper.
- **Dynamic IR generation** for supported stateful HVAC protocols, including temperature, mode, fan and power state where supported.
- **Local decoding** for receiver-based synchronization and diagnostics.
- Supplies protocol services to HanJoo IR Manager, which exposes devices as Home Assistant entities such as `climate`, `fan`, `media_player`, remote/button entities and learned custom controls.

## Coverage

The Core contains two overlapping local protocol layers:

- about **90 structured protocol entries** from the current `irtxrx` registry;
- up to **128 IRremoteESP8266 recognition protocol IDs** at the pinned upstream revision used by HanJoo.

Do not add these two numbers together as a unique-device total because many protocol families overlap.

Common supported/recognizable families include Daikin, Panasonic, LG, Mitsubishi Electric, Mitsubishi Heavy Industries, Samsung, Gree, Midea, Haier, Toshiba, Fujitsu, Hitachi, Carrier, Sharp, Sanyo, Whirlpool, TCL, Kelvinator, Electra and many generic NEC/RC5/RC6/Sony/JVC-style protocols.

Model coverage can be extended in HanJoo IR Manager through optional SmartIR/Flipper-IRDB search, and unknown devices can still be handled through manual learning.

## Architectures

- `amd64`
- `aarch64`

## Installation

1. Home Assistant → **Settings** → **Add-ons** → **Add-on Store**.
2. Open **⋮ → Repositories**.
3. Add `https://github.com/kimhanzoo/HanJoo_IR_Addon`.
4. Open **HanJoo IR Core** and install it.
5. Start the add-on.
6. Install/configure HanJoo IR Manager from HACS:
   `https://github.com/kimhanzoo/hanjoo-ir-manager`

## Online libraries

SmartIR and Flipper-IRDB are not required for the Core itself. They are optional sources used by the Manager during explicit brand/model search.
