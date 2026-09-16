# HanJoo IR — One-install repository

Install **HanJoo IR Core** from this add-on repository. The add-on automatically installs/updates the thin Home Assistant integration into `/config/custom_components/hanjoo_ir`.

After the first install or an integration update, restart Home Assistant Core once. The integration bootstraps its single config entry automatically; HACS is not required for the normal installation path.

The separate HACS repository remains supported as a manual/developer installation path. If you want HACS to own the integration, disable `install_manager` in the add-on options.

Architecture in v0.6.0:
- Home Assistant Integration: thin UI/entities/HA bridge and online-library I/O.
- HanJoo IR Core add-on: protocol engines plus protected Brain service for raw-family classification, candidate/profile scoring, and safe recommendation policy.
