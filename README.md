# 🎙️ SonicScroll

> **A premium, browser-only Hindi text-to-speech proofreader.**
> Paste your story · Hear it read aloud · Fix typos on the fly.

[![License: MIT](https://img.shields.io/badge/License-MIT-7c3aed.svg)](https://opensource.org/licenses/MIT)
[![Made with Vanilla JS](https://img.shields.io/badge/Made%20with-Vanilla%20JS-f7df1e.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Web Speech API](https://img.shields.io/badge/Web%20Speech%20API-Native-10b981.svg)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
[![No Backend](https://img.shields.io/badge/Backend-None-ef4444.svg)](#)

---

## ✨ What is SonicScroll?

**SonicScroll** is a zero-cost, 100% local, serverless web app that reads your **Hindi text aloud** using the browser's native **Web Speech API**. It is designed specifically for **Hindi story writers, editors, and proofreaders** who want to *listen* to their text and catch typos, awkward phrasing, or missing punctuation — all without sending a single character to any server.

No accounts. No uploads. No tracking. Just your story, spoken back to you in Hindi.

---

## 🎯 Why SonicScroll?

Proofreading by reading silently is slow and error-prone. Reading *aloud* catches mistakes your eyes skip over. But reading aloud yourself is tiring.

SonicScroll solves this by:
- Reading your **Hindi text** back to you in a natural Hindi voice.
- Letting you **pause mid-sentence** to fix typos with your earbuds in.
- Letting you **jump backward / forward** across sentences freely.
- Letting you **change speed** (0.5x – 3x) to match your editing pace.

Everything happens **inside your browser tab**. Nothing leaves your device.

---

## 🚀 Features

| Feature | Description |
|---|---|
| 🗣️ **Hindi Voice Selection** | Auto-detects `hi-IN` / `hi` voices on your OS and shows them first. |
| ⚡ **Instant Playback** | Engine warm-up on page load cuts the first-word delay by 300–800 ms. |
| 🧠 **Sentence-Aware Chunking** | Splits on `।`, `॥`, `.`, `!`, `?`, and soft punctuation — never breaks Devanagari matras. |
| 🎚️ **Speed Control** | Range from **0.5x → 3.0x**, with browser-aware caps & micro-chunk fallback. |
| ⏯️ **Play / Pause / Stop** | Three distinct controls with clear visual states. |
| ⏮️ **Skip Controls** | Jump one sentence back/forward, or jump −10 / +10 sentences. |
| 🎯 **Seek Slider** | Scrub to any sentence in the story instantly. |
| 📊 **Live Counters** | Real-time word count, character count, and sentence count. |
| 🎨 **Premium UI** | Soft gradients, rounded surfaces, animated status dot, keyboard-friendly. |
| 📱 **Responsive** | Two-column desktop layout collapses to a single column on mobile. |
| ⌨️ **Keyboard Shortcut** | `Ctrl + Enter` (or `⌘ + Enter`) starts playback instantly. |
| 🔒 **Fully Private** | No backend, no analytics, no network calls after page load. |

---

## 🌐 Live Demo

Deploy it yourself in 2 minutes (see [Deployment](https://riteshbytex.github.io/SonicScroll/)) or host it on any static host.
