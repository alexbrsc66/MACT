// Main process: window + TCP transport to the firmware (MAP port 3334) +
// .bin / config file I/O. The renderer asks for actions via IPC; file reads
// and chunked TCP sends happen here.
'use strict';

const path = require('path');
const fs = require('fs');
const net = require('net');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { TcpTransport, T, describeError } = require('./transport-tcp');

// Windows/VM/RDP environments without a usable GPU.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

const CHUNK = 1024;              // data bytes per MAP_WRITE
let win = null;
let transport = null;

// Standard CRC-32 (poly 0xEDB88320, as zlib/PKZIP/MAME), used to identify
// the ROM (shown in hex); no external dependencies.
function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, title: 'MACT Studio',
    icon: path.join(__dirname, '..', 'build', 'icons', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
}

// ---- IPC ----
ipcMain.handle('connect', (_e, { host, port }) => {
  if (transport) transport.stop();
  transport = new TcpTransport({ host, port: port || 3334 });
  transport.on('status', (st) => send('status', st));
  transport.on('frame', (f) => send('frame', { type: f.type, payload: Array.from(f.payload) }));
  transport.connect();
  return true;
});

ipcMain.handle('disconnect', () => { if (transport) transport.stop(); return true; });

ipcMain.handle('pick-bin', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose a .bin file',
    filters: [{ name: 'Binary', extensions: ['bin', 'rom'] }, { name: 'All files', extensions: ['*'] }],
    properties: ['openFile'],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  const data = fs.readFileSync(p);
  return { path: p, name: path.basename(p), size: data.length, crc: crc32(data) };
});

// Send a region: read the .bin, MAP_WRITE in chunks, then MAP_MODE to enable it.
ipcMain.handle('send-region', async (_e, { file, start, mode }) => {
  if (!transport || !transport.connected) throw new Error('not connected');
  const data = fs.readFileSync(file);
  const s = start & 0xffff;
  for (let off = 0; off < data.length; off += CHUNK) {
    const chunk = data.subarray(off, Math.min(off + CHUNK, data.length));
    transport.writeChunk((s + off) & 0xffff, chunk);
    send('progress', { name: path.basename(file), sent: Math.min(off + CHUNK, data.length), total: data.length });
    await new Promise((r) => setImmediate(r));   // let the socket breathe
  }
  transport.setMode(s, data.length, mode);
  return { bytes: data.length };
});

ipcMain.handle('clear-region', (_e, { start, len }) => {
  if (!transport || !transport.connected) throw new Error('not connected');
  transport.clear(start & 0xffff, len & 0xffff);
  return true;
});

// Enable a region without data (plain RAM/HW): MAP_MODE only, no MAP_WRITE.
ipcMain.handle('set-mode', (_e, { start, len, mode }) => {
  if (!transport || !transport.connected) throw new Error('not connected');
  transport.setMode(start & 0xffff, len & 0xffff, mode);
  return true;
});

// Bank window: send the image into the firmware pool (BANK_WRITE in chunks),
// then the configuration (BANK_CONFIG), which enables it. imgBase = position
// in the pool, computed by the renderer (windows are placed one after another).
ipcMain.handle('send-bank', async (_e, b) => {
  if (!transport || !transport.connected) throw new Error('not connected');
  const data = fs.readFileSync(b.file);
  const name = path.basename(b.file);
  for (let off = 0; off < data.length; off += CHUNK) {
    const chunk = data.subarray(off, Math.min(off + CHUNK, data.length));
    transport.bankWrite(b.imgBase + off, chunk);
    send('progress', { name, sent: Math.min(off + CHUNK, data.length), total: data.length, bank: true });
    await new Promise((r) => setImmediate(r));
  }
  transport.bankConfig({
    win: b.win, firstPage: b.firstPage, npages: b.npages, mode: b.mode,
    imgBase: b.imgBase, imgSize: data.length, regAddr: b.regAddr, regMask: b.regMask,
    bits: b.bits, inv: b.inv, resetBank: b.resetBank,
  });
  return { bytes: data.length };
});

ipcMain.handle('clear-bank', (_e, { win }) => {
  if (!transport || !transport.connected) throw new Error('not connected');
  transport.bankClear(win);
  return true;
});

// Watch: read a range (asynchronous answer as a MAP_DATA frame).
ipcMain.handle('mem-read', (_e, { id, addr, len, src }) => {
  if (!transport || !transport.connected) throw new Error('not connected');
  transport.read(id, addr, len, src);
  return true;
});

// ---- Terminal: firmware text console (port 3335, one line per command) ----
// The firmware accepts one console client only: connecting here disconnects
// a PuTTY session on 3335, if any.
let term = null;
function termStop() { if (term) { try { term.destroy(); } catch (_) {} term = null; } }

ipcMain.handle('term-connect', (_e, { host, port }) => {
  termStop();
  const s = new net.Socket();
  term = s;
  s.setEncoding('latin1');
  // As in TcpTransport: report the error once, together with the close.
  let lastError = null;
  s.on('connect', () => send('term-status', { connected: true }));
  s.on('data', (txt) => send('term-data', txt));
  s.on('error', (e) => { lastError = describeError(e); });
  s.on('close', () => {
    if (term === s) term = null;
    send('term-status', lastError ? { connected: false, error: lastError } : { connected: false });
  });
  s.connect(port || 3335, host);
  return true;
});
ipcMain.handle('term-disconnect', () => { termStop(); return true; });
ipcMain.handle('term-send', (_e, line) => {
  if (!term) throw new Error('terminal not connected');
  term.write(String(line) + '\r\n', 'latin1');
  return true;
});

ipcMain.handle('bank-state', () => {
  if (!transport || !transport.connected) throw new Error('not connected');
  transport.bankState();
  return true;
});

ipcMain.handle('list-regions', () => {
  if (!transport || !transport.connected) throw new Error('not connected');
  transport.list();
  return true;
});

ipcMain.handle('save-config', async (_e, cfg) => {
  const r = await dialog.showSaveDialog(win, { title: 'Save configuration', defaultPath: 'regions.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, JSON.stringify(cfg, null, 2));
  return r.filePath;
});

ipcMain.handle('load-config', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Load configuration', filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  return { path: r.filePaths[0], cfg: JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')) };
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (transport) transport.stop(); termStop(); if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
