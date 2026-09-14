# HanJoo IR Add-on Repository

Repository for **HanJoo IR Core**, the local protocol engine used by HanJoo IR Manager.

## Main capabilities

- Local IR protocol generation and decoding.
- Automatic analysis of signals captured from an existing physical remote.
- Broad local recognition through `irtxrx` plus IRremoteESP8266.
- Dynamic HVAC control for supported stateful protocols.
- Works with HanJoo IR Manager to create Home Assistant entities such as `climate`, `fan`, `media_player`, remote/button entities and learned custom devices.
- Supports both `amd64` and `aarch64` Home Assistant systems.

The current local protocol layers include about **90 structured codec entries** and up to **128 IRremoteESP8266 recognition protocol IDs**. These sets overlap, so they are not summed as a unique-device count. Brand/model coverage can be extended by HanJoo IR Manager using SmartIR/Flipper-IRDB search, while manual learning handles unknown devices.

Common protocol families include Daikin, Panasonic, LG, Mitsubishi, Samsung, Gree, Midea, Haier, Toshiba, Fujitsu, Hitachi, Carrier, Sharp, Sanyo, Whirlpool, TCL, Kelvinator, Electra and generic NEC/RC5/RC6/Sony/JVC-style remotes.

## Install

1. Home Assistant → **Settings → Add-ons → Add-on Store**.
2. Open **⋮ → Repositories**.
3. Add this repository:
   `https://github.com/kimhanzoo/HanJoo_IR_Addon`
4. Install **HanJoo IR Core**.
5. Start the add-on.
6. Install HanJoo IR Manager from HACS:
   `https://github.com/kimhanzoo/hanjoo-ir-manager`

See the add-on documentation for details and architecture support.
