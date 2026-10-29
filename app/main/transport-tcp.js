// TCP transport to the firmware (MAP port, default 3334).
// Frame: [len:u16 LE][type:u8][payload]. len = bytes of (type+payload).
'use strict';

const net = require('net');
const { EventEmitter } = require('events');

// Message types (see PROTOCOL.md)
const T = {
  MAP_WRITE: 0x01, MAP_MODE: 0x02, MAP_CLEAR: 0x03, MAP_LIST: 0x04,
  BANK_WRITE: 0x05, BANK_CONFIG: 0x06, BANK_CLEAR: 0x07, BANK_STATE: 0x08, MAP_READ: 0x09,
  MAP_ACK: 0x81, MAP_INFO: 0x82, MAP_ERR: 0x83, BANK_INFO: 0x84, MAP_DATA: 0x85,
};

// Socket error -> text for the status bar. EHOSTUNREACH towards a LAN address
// is what macOS returns when the app has no "Local Network" permission.
function describeError(e) {
  let msg = e.message;
  if (e.code === 'EHOSTUNREACH' && process.platform === 'darwin') {
    msg += ' - no route to host: check System Settings > Privacy & Security > Local Network for MACT Studio';
  } else if (e.code === 'ECONNREFUSED') {
    msg += ' - connection refused: wrong port, or the firmware is not listening';
  }
  return msg;
}

class TcpTransport extends EventEmitter {
  constructor({ host, port }) {
    super();
    this.host = host;
    this.port = port;
    this.sock = null;
    this.rx = Buffer.alloc(0);
    this.connected = false;
  }

  connect() {
    this.stop();
    const s = new net.Socket();
    this.sock = s;
    // A socket error is always followed by close: remember it and report it
    // once, with the close, so the UI shows the reason and not a bare
    // "disconnected" (the close used to overwrite the error message).
    let lastError = null;
    s.on('connect', () => { this.connected = true; this.emit('status', { connected: true }); });
    s.on('data', (chunk) => this._onData(chunk));
    s.on('error', (e) => { lastError = describeError(e); });
    s.on('close', () => {
      this.connected = false;
      this.emit('status', lastError ? { connected: false, error: lastError } : { connected: false });
    });
    s.connect(this.port, this.host);
  }

  stop() {
    if (this.sock) { try { this.sock.destroy(); } catch (_) {} this.sock = null; }
    this.connected = false;
    this.rx = Buffer.alloc(0);
  }

  _onData(chunk) {
    this.rx = Buffer.concat([this.rx, chunk]);
    // extract all the complete frames
    while (this.rx.length >= 2) {
      const len = this.rx.readUInt16LE(0);
      if (this.rx.length < 2 + len) break;
      const type = this.rx[2];
      const payload = this.rx.subarray(3, 2 + len);
      this.rx = this.rx.subarray(2 + len);
      this.emit('frame', { type, payload: Buffer.from(payload) });
    }
  }

  // send a frame [len][type][payload]
  send(type, payload) {
    if (!this.sock || !this.connected) return false;
    const body = payload || Buffer.alloc(0);
    const len = 1 + body.length;
    const hdr = Buffer.alloc(3);
    hdr.writeUInt16LE(len, 0);
    hdr[2] = type;
    return this.sock.write(Buffer.concat([hdr, body]));
  }

  // --- high-level helpers ---
  writeChunk(addr, data) {
    const p = Buffer.alloc(4 + data.length);
    p.writeUInt16LE(addr & 0xffff, 0);
    p.writeUInt16LE(data.length & 0xffff, 2);
    data.copy(p, 4);
    return this.send(T.MAP_WRITE, p);
  }

  setMode(start, len, mode) {
    const p = Buffer.alloc(5);
    p.writeUInt16LE(start & 0xffff, 0);
    p.writeUInt16LE(len & 0xffff, 2);
    p[4] = mode & 0xff;
    return this.send(T.MAP_MODE, p);
  }

  clear(start, len) {
    const p = Buffer.alloc(4);
    p.writeUInt16LE(start & 0xffff, 0);
    p.writeUInt16LE(len & 0xffff, 2);
    return this.send(T.MAP_CLEAR, p);
  }

  list() { return this.send(T.MAP_LIST, Buffer.alloc(0)); }

  // --- bank windows (see PROTOCOL.md) ---
  // Image data into the firmware bank pool, starting at off.
  bankWrite(off, data) {
    const p = Buffer.alloc(6 + data.length);
    p.writeUInt32LE(off >>> 0, 0);
    p.writeUInt16LE(data.length & 0xffff, 4);
    data.copy(p, 6);
    return this.send(T.BANK_WRITE, p);
  }

  // Configure and enable a window (19-byte payload).
  bankConfig(c) {
    const p = Buffer.alloc(19);
    p[0] = c.win & 0xff;
    p[1] = c.firstPage & 0xff;
    p[2] = c.npages & 0xff;
    p[3] = c.mode & 0xff;
    p.writeUInt32LE(c.imgBase >>> 0, 4);
    p.writeUInt32LE(c.imgSize >>> 0, 8);
    p.writeUInt16LE(c.regAddr & 0xffff, 12);
    p.writeUInt16LE(c.regMask & 0xffff, 14);
    p[16] = c.bits & 0xff;
    p[17] = c.inv & 0xff;
    p[18] = c.resetBank & 0xff;
    return this.send(T.BANK_CONFIG, p);
  }

  bankClear(win) { return this.send(T.BANK_CLEAR, Buffer.from([win & 0xff])); }
  bankState() { return this.send(T.BANK_STATE, Buffer.alloc(0)); }

  // Read a range for the watch: answer MAP_DATA with the same id.
  // src 0 = mirror (no bus cycle), 1 = CPU view (real bus cycle).
  read(id, addr, len, src) {
    const p = Buffer.alloc(5);
    p[0] = id & 0xff;
    p.writeUInt16LE(addr & 0xffff, 1);
    p[3] = len & 0xff;
    p[4] = src & 0xff;
    return this.send(T.MAP_READ, p);
  }
}

module.exports = { TcpTransport, T, describeError };
