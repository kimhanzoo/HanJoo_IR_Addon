# HanJoo IR Core

HanJoo IR Core is the local protocol engine used by **HanJoo IR Manager**. It performs IR protocol generation, decoding and local remote identification so the Manager can work without depending on an online service for normal control.

## What it does

- **Local remote identification** from captured IR signals.
- **Broad protocol recognition** using a structured `irtxrx` codec layer plus a native IRremoteESP8266 recognition helper.
- **Dynamic IR generation** for supported stateful HVAC protocols, including temperature, mode, fan and power state where the underlying protocol supports them.
- **Local decoding** for receiver-based synchronization and diagnostics.
- Works together with HanJoo IR Manager to expose devices as normal Home Assistant entities such as `climate`, `fan`, `media_player`, remote/button entities and learned custom controls.

## Coverage

The Core contains two complementary local protocol layers:

- about **90 structured protocol entries** from the current `irtxrx` registry, focused strongly on HVAC control;
- up to **128 IRremoteESP8266 recognition protocol IDs** at the pinned upstream revision used by HanJoo.

Those two sets overlap, so they must **not** be added together as a unique-device count. Device-model coverage is larger when HanJoo Manager uses optional SmartIR/Flipper-IRDB brand/model search, and unknown devices can still be handled through manual learning.

Common supported/recognizable families include variants from brands such as:

- Daikin
- Panasonic
- LG
- Mitsubishi Electric / Mitsubishi Heavy Industries
- Samsung
- Gree
- Midea
- Haier
- Toshiba
- Fujitsu
- Hitachi
- Carrier
- Sharp
- Sanyo
- Whirlpool
- TCL
- Kelvinator
- Electra
- and many generic NEC/RC5/RC6/Sony/JVC-style IR protocols

Exact model support depends on the remote protocol and whether a structured dynamic encoder exists for that family.

## Architectures

Supported Home Assistant add-on architectures:

- `amd64` — Intel/AMD mini PCs and x86-64 systems
- `aarch64` — Raspberry Pi 4/5, Home Assistant Green and compatible ARM64 systems

The public repository contains a protected HanJoo runtime rather than the clear proprietary Core source. IRremoteESP8266 is compiled from pinned upstream source during the add-on image build.

## Installation

Repository:

https://github.com/kimhanzoo/HanJoo_IR_Addon

1. Home Assistant → **Settings** → **Add-ons** → **Add-on Store**.
2. Open **⋮ → Repositories**.
3. Add `https://github.com/kimhanzoo/HanJoo_IR_Addon`.
4. Open **HanJoo IR Core**.
5. Select **Install**.
6. Start the add-on after installation completes.
7. Install/configure **HanJoo IR Manager** from HACS.

Manager repository:

https://github.com/kimhanzoo/hanjoo-ir-manager

## Relationship with SmartIR and Flipper-IRDB

HanJoo IR Core itself is local. SmartIR and Flipper-IRDB are optional online profile sources used by **HanJoo IR Manager only when the user explicitly searches by brand/model**. Automatic identification from the physical remote does not require those online sources.
