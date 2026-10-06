<h1 align="center">
  <img src="src/assets/logo.png" width="128" alt="Sailock Logo">
  <br>
  Sailock for Windows
</h1>

<p align="center">
  <strong>Local-first password manager for Windows</strong>
  <br>
  <em>No cloud. No internet required. Just your data, securely offline.</em>
</p>

<p align="center">
  <a href="https://github.com/Sailock-Lab/Sailock.Windows/releases/latest"><img src="https://img.shields.io/github/v/release/Sailock-Lab/Sailock.Windows?style=for-the-badge&label=Latest%20release" alt="Latest release"></a>
  <img src="https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows">
  <img src="https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/Tauri-24C8DB?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
</p>

---

## What is Sailock?
**Sailock** is a local-first password manager built for Windows. Your vault lives only on your device: no account, no cloud storage, and no internet connection needed to use it.

Built with **Rust** and **Tauri**, Sailock is lightweight (the installer is about 4–5 MB) and fast.

---

## Features
- **Local-first**: all data stays on your device. No cloud, no account.
- **Organized Vault**: folders and subfolders, favorites, trash, search, and list or gallery views.
- **Entry templates**: Password, Identity, Card, Note, Wi-Fi and Custom entries with typed fields.
- **Built-in 2FA codes**: store a TOTP secret in an entry and see its verification code.
- **Password generator**: passwords, passphrases, random usernames and recovery codes.
- **Two-factor unlock**: protect Sailock itself with an authenticator app, with single-use recovery codes.
- **Re-authentication**: the master password is required to reveal or copy a password, open the Trash, delete permanently, export, or clear the Audit Log.
- **Audit Log**: a record of important activity inside the app.
- **Encrypted backups**: export and import your vault as a `.slock` file protected by its own password.
- **Auto-lock**: lock after inactivity or when the window is minimized.
- **Accessibility**: high contrast mode, adjustable text size and reduced motion.
- **Light, dark and system themes**.
- **12 languages**: English, Spanish, German, French, Italian, Japanese, Korean, Dutch, Polish, Portuguese, Russian and Chinese.

---

## How your data is protected
- The vault is encrypted with **AES-256-GCM**. The key is derived from your master password with **Argon2** and a random salt, and it exists only in memory while the vault is unlocked.
- Your master password is never stored. **If you forget it, your data cannot be recovered.**
- 2FA recovery codes are stored only as SHA-256 hashes and are shown once.
- Sensitive actions are verified by the Rust core, not only by the interface.
- Sailock has no analytics or telemetry. Its web view blocks external connections, and the only network request the app makes is the optional update check described below.
- Sailock has not been independently audited yet. The code is public so you can read it.

---

## Installation
### Download the installer
1. Open the [Releases page](https://github.com/Sailock-Lab/Sailock.Windows/releases/latest).
2. Download `Sailock_<version>_x64-setup.exe` (recommended) or the `.msi`. The `latest.json` file is used by the in-app updater and is not needed for a manual install.
3. Run it. Windows may show a **SmartScreen** warning because the installer is not yet signed with a Windows code-signing certificate. Click **More info → Run anyway**.

If you installed Sailock with the `.msi`, keep using the `.msi` for new versions, so you don't end up with two installations. Your vault is kept when you update.

Every file on the release page shows its SHA-256 checksum, so you can verify your download.

### Updates
- Sailock checks GitHub Releases for a newer version when it starts. This can be turned off in **Settings → System**, and you can always use **Check for updates** manually.
- The check only downloads a small public file (`latest.json`). No data from your vault is ever sent.
- Sailock always asks before installing, and every update is verified with a cryptographic signature before it is installed.

### System requirements
- **OS**: Windows 10 or later (64-bit)
- **WebView2 Runtime**: included with Windows 11. The installer takes care of it if it is missing.

## Security
Please do **not** open a public issue for a security vulnerability. Report it privately through [GitHub's security advisories](https://github.com/Sailock-Lab/Sailock.Windows/security/advisories/new). Past advisories are listed in the [Security tab](https://github.com/Sailock-Lab/Sailock.Windows/security/advisories).

---

## Contributing
We welcome contributions from the community! Here's how you can help:

### Ways to contribute
- **Report bugs**: open an issue with detailed steps to reproduce.
- **Suggest features**: share your ideas in [Discussions](https://github.com/Sailock-Lab/Sailock.Windows/discussions).
- **Improve documentation**: fix typos or add examples.
- **Submit code**: fork the repository, create a branch and open a pull request. For big changes, please open an issue first. Issues labeled `good first issue` are a good place to start.

---

## License
Copyright © 2026 Alba Ayala Vilanova. All rights reserved.

This project is source-available for reading and contribution purposes only.
Copying, reusing or distributing any part of this code without explicit written permission is not allowed.
See [LICENSE](LICENSE) for full terms.
