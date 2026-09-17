# HanJoo IR v0.6.6

## Recognition improvements

- Added multi-frame / multi-section capture analysis before protocol classification.
- Long inter-frame gaps are used to split one physical remote press into useful decode windows without counting them as separate captures.
- IRremoteESP8266 is now tried against the full burst, individual frames, adjacent 2–4 frame windows, and a small set of parity-safe trimmed starts.
- Stateful AC matches are prioritized because native AC decoders validate structured state/checksum data.
- irtxrx evidence is also merged across variants, with conservative filtering for generic non-AC false positives.
- Existing `/v1/probe` behavior is preserved; enhanced analysis is applied to `/v1/probe-all`.

This is primarily intended to improve detection of Daikin and other stateful AC remotes, while also helping Mitsubishi, Panasonic, Fujitsu, Hitachi, Gree, Midea, Haier, Toshiba and other protocols already covered by the bundled public decoder libraries.

## Compatibility

- Add-on/Core/Manager version synchronized to 0.6.6.
- amd64 and aarch64 remain supported.
