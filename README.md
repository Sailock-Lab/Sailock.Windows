<h1 align="center">
  <img src="https://raw.githubusercontent.com/Sailock-Lab/Sailock.Windows/main/.github/logo.png" width="128" alt="Sailock Logo">
  <br>
  Windows Desktop
</h1>

<p align="center">
  <strong>🔐 Local-first password manager for Windows</strong>
  <br>
  <em>No cloud. No internet required. Just your data, securely offline.</em>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#building">Building</a> •
  <a href="#roadmap">Roadmap</a> •
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows">
  <img src="https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/Tauri-24C8DB?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
</p>

<p align="center">
  <a href="https://github.com/Sailock-Lab/Sailock.Windows/releases">
    <img src="https://img.shields.io/github/v/release/Sailock-Lab/Sailock.Windows?style=flat-square&color=0078D6" alt="Latest Release">
  </a>
  <a href="https://github.com/Sailock-Lab/Sailock.Windows/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/Sailock-Lab/Sailock.Windows?style=flat-square&color=0078D6" alt="License">
  </a>
  <a href="https://github.com/Sailock-Lab/Sailock.Windows/issues">
    <img src="https://img.shields.io/github/issues/Sailock-Lab/Sailock.Windows?style=flat-square&color=0078D6" alt="Issues">
  </a>
</p>

---

## 🚀 What is Sailock?
**Sailock** is a local-first password manager built for Windows. It prioritizes your privacy and security by keeping all your data offline — no cloud storage, no internet connection required.
Built with **Rust** and **Tauri**, Sailock is fast, secure, and lightweight.

---

## ✨ Features
- 🔐 **Local-first**: All data stays on your device. No cloud, no sync.
- 📴 **Offline access**: Use it anywhere, even without internet.
- ⚡ **Blazing fast**: Powered by Rust and Tauri for performance.
- 🔒 **Secure encryption**: Your data is encrypted using industry-standard algorithms.
- 🎨 **Modern UI**: Clean, intuitive interface built with React and TypeScript.
- 🧩 **Extensible**: Modular architecture ready for future features.

---

## 🖥️ System Requirements
- **OS**: Windows 10 or later (Windows 11 recommended)
- **RAM**: 4 GB minimum (8 GB recommended)
- **Storage**: 500 MB free space
- **Internet**: Only required for initial download (all data is stored locally)

---

## 📥 Installation
### Download the installer
Download the latest release from the [Releases page](https://github.com/Sailock-Lab/Sailock.Windows/releases).

### Build from source
#### Prerequisites
- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/) (v18 or later)
- [Tauri CLI](https://tauri.app/start/prerequisites/)

#### Steps
```bash
# Clone the repository
git clone https://github.com/Sailock-Lab/Sailock.Windows.git
cd Sailock.Windows

# Install dependencies
npm install

# Build the app
npm run tauri build
```
The executable will be available in src-tauri/target/release/.

--- 

## 🏗️ Development
### Run in development mode
```bash
# Install dependencies
npm install

# Run the development server
npm run tauri dev
```

---

## 🤝 Contributing
We welcome contributions from the community! Here's how you can help:

### Ways to contribute
- **Report bugs**: Open an issue with detailed steps to reproduce
- **Suggest features**: Share your ideas in Discussions
- **Improve documentation**: Fix typos or add examples
- **Submit code**: Pull requests are always welcome
