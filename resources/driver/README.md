# ViGEmBus release input

Run `pnpm fetch:driver` before making the Windows installer. The script downloads the official signed ViGEmBus 1.22.0 installer and refuses to keep it unless its SHA-256 is:

`89220a7865076b342892f98865f3499fb7c4cfd673159e89d352c360fd014c6a`

The installer is intentionally not committed. Fighting Game Stick only opens the publisher's installer after a user action; it never performs a silent driver installation or removal.
