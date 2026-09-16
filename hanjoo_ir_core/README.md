# HanJoo IR Core

HanJoo IR Core is the local protocol engine used by **HanJoo IR Manager**.

## What it does

- **Local remote identification** from captured IR signals.
- **Broad protocol recognition** using `irtxrx` plus a native IRremoteESP8266 recognition helper.
- **Dynamic IR generation** for supported stateful HVAC protocols.
- **Local decoding** for receiver-based synchronization and diagnostics.
- Works with HanJoo IR Manager to expose devices as Home Assistant entities such as `climate`, `fan`, `media_player`, remote/button entities and learned custom controls.

## Coverage

The Core has two overlapping local layers:

- about **90 structured protocol entries** from the current `irtxrx` registry;
- up to **128 IRremoteESP8266 recognition protocol IDs** at the pinned upstream revision.

These values overlap, so they are **not** a unique-device total.

Common supported/recognizable families include:

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
- generic NEC / RC5 / RC6 / Sony / JVC-style protocols

Exact model support depends on the protocol and whether a structured dynamic encoder exists. HanJoo IR Manager can extend model coverage through optional SmartIR/Flipper-IRDB search, and unknown devices can still be handled through manual learning.

## Architectures

- `amd64`
- `aarch64`

## Installation

Repository:

https://github.com/kimhanzoo/HanJoo_IR_Addon

1. Home Assistant → **Settings → Add-ons → Add-on Store**.
2. Open **⋮ → Repositories**.
3. Add `https://github.com/kimhanzoo/HanJoo_IR_Addon`
4. Open **HanJoo IR Core**.
5. Install and start it.
6. Install/configure HanJoo IR Manager from HACS:
   `https://github.com/kimhanzoo/hanjoo-ir-manager`

## Online libraries

SmartIR and Flipper-IRDB are optional sources used by the Manager during explicit brand/model search. Automatic identification from the physical remote uses the local Core.
