#!/usr/bin/env node
// Builds www/ — a self-contained web root for Capacitor (iOS) assembled from renderer/ + assets/.
// renderer/ and assets/ are the Electron build's source of truth and stay untouched; this script
// only ever writes into www/. Run via `npm run build:web`, or automatically via `npm run cap:sync`.
//
// Why this exists: renderer/index.html references assets/ as a sibling directory ("../assets/…"),
// which matches Electron's on-disk layout. Capacitor bundles only webDir's contents into the native
// app, so the combined output needs assets/ nested *inside* the web root instead — this script
// copies both into www/ and rewrites just that one path difference in the copied index.html.

const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const WWW = path.join(root, 'www')

fs.rmSync(WWW, { recursive: true, force: true })
fs.mkdirSync(WWW, { recursive: true })

// renderer/* -> www/*
fs.cpSync(path.join(root, 'renderer'), WWW, { recursive: true })

// assets/ -> www/assets/
fs.cpSync(path.join(root, 'assets'), path.join(WWW, 'assets'), { recursive: true })

// Rewrite "../assets/" -> "assets/" in the copied index.html only.
const indexPath = path.join(WWW, 'index.html')
const html = fs.readFileSync(indexPath, 'utf8').split('../assets/').join('assets/')
fs.writeFileSync(indexPath, html, 'utf8')

console.log(`Built www/ from renderer/ + assets/ for Capacitor.`)
