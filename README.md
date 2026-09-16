# HanJoo IR Add-on Repository

Repository for **HanJoo IR Core**, the local protocol engine used by HanJoo IR Manager.

Main capabilities:
- local IR protocol generation and decoding;
- automatic analysis of signals captured from an existing physical remote;
- about **90 structured protocol entries** plus up to **128 IRremoteESP8266 recognition protocol IDs** (overlapping sets);
- dynamic HVAC control for supported stateful protocols;
- `amd64` and `aarch64` support.

Common families include Daikin, Panasonic, LG, Mitsubishi, Samsung, Gree, Midea, Haier, Toshiba, Fujitsu, Hitachi, Carrier, Sharp, Sanyo, Whirlpool, TCL, Kelvinator, Electra and generic NEC/RC5/RC6/Sony/JVC-style remotes.

## Install

1. Home Assistant → **Settings → Add-ons → Add-on Store**.
2. Open **⋮ → Repositories**.
3. Add `https://github.com/kimhanzoo/HanJoo_IR_Addon`
4. Install **HanJoo IR Core** and start it.
5. Install HanJoo IR Manager from HACS:
   `https://github.com/kimhanzoo/hanjoo-ir-manager`
