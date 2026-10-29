#!/usr/bin/env python3
"""MACT board simulator: answers MACT Studio as if it were the firmware.

Listens on the two firmware TCP ports, so MACT Studio can be tried without a
board (connection, ROM upload, bank windows, memory watch, terminal):
  3334  binary MAP protocol (docs/protocol.md)
  3335  text console (banner, '> ' prompt, a few commands)
No CPU is emulated: uploaded images are stored in a 64 KB memory, the watch
reads that memory, and a few bytes at C000-C003 change 60 times per second.

usage: python3 mact_board_sim.py [--bind 0.0.0.0] [--map-port 3334] [--con-port 3335]
Only the Python standard library is needed. Stop with Ctrl+C.
"""
import argparse, asyncio, socket, struct, time

# MAP protocol message types (docs/protocol.md)
MAP_WRITE, MAP_MODE, MAP_CLEAR, MAP_LIST = 0x01, 0x02, 0x03, 0x04
BANK_WRITE, BANK_CONFIG, BANK_CLEAR, BANK_STATE, MAP_READ = 0x05, 0x06, 0x07, 0x08, 0x09
MAP_ACK, MAP_INFO, MAP_ERR, BANK_INFO, MAP_DATA = 0x81, 0x82, 0x83, 0x84, 0x85
NAMES = {MAP_WRITE: "MAP_WRITE", MAP_MODE: "MAP_MODE", MAP_CLEAR: "MAP_CLEAR", MAP_LIST: "MAP_LIST",
         BANK_WRITE: "BANK_WRITE", BANK_CONFIG: "BANK_CONFIG", BANK_CLEAR: "BANK_CLEAR",
         BANK_STATE: "BANK_STATE", MAP_READ: "MAP_READ"}
BANK_WINDOWS, BANK_POOL, MAP_READ_MAX = 4, 0x10000, 64


class Board:
    """State of the simulated board: memory, page modes, bank windows, run state."""

    def __init__(self):
        self.mem = bytearray(0x10000)
        self.page_mode = [0] * 256
        self.pool = bytearray(BANK_POOL)
        self.banks = [None] * BANK_WINDOWS        # dict per configured window
        self.running = False
        self.t0 = time.monotonic()

    def tick(self):
        """Change a few bytes like a game would: frame counter and a pattern at C000."""
        n = int((time.monotonic() - self.t0) * 60)
        self.mem[0xC000] = n & 0xFF
        self.mem[0xC001] = (n >> 8) & 0xFF
        self.mem[0xC002] = (n * 7) & 0xFF
        self.mem[0xC003] = 0x55 if (n // 30) & 1 else 0xAA
        for b in self.banks:                      # pretend the game switches bank twice a second
            if b and self.running:
                b["cur"] = (n // 30) % max(1, b["nbanks"])
                b["switches"] = n // 30

    def set_mode(self, start, length, mode):
        """Mode of every 256-byte page touched by the range (as map_set_mode in the firmware)."""
        end = min(0xFFFF, start + max(1, length) - 1)
        for pg in range(start >> 8, (end >> 8) + 1):
            self.page_mode[pg] = mode

    def regions(self):
        """Consecutive pages with the same non-zero mode -> (start, len, mode), max 40."""
        out, pg = [], 0
        while pg < 256 and len(out) < 40:
            m = self.page_mode[pg]
            if m:
                s = pg
                while pg < 256 and self.page_mode[pg] == m:
                    pg += 1
                out.append((s << 8, min(0xFFFF, (pg - s) * 256), m))
            else:
                pg += 1
        return out


def frame(t, payload=b""):
    """[len:u16 LE][type][payload], len = bytes of type + payload."""
    return struct.pack("<HB", 1 + len(payload), t) + payload


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


async def map_client(board, reader, writer):
    """Port 3334: binary MAP protocol."""
    peer = writer.get_extra_info("peername")
    log(f"[3334] client connected {peer[0]}:{peer[1]}")
    buf, writes = b"", 0
    try:
        while True:
            data = await reader.read(4096)
            if not data:
                break
            buf += data
            while len(buf) >= 2:
                n = struct.unpack_from("<H", buf)[0]
                if len(buf) < 2 + n:
                    break
                t, pl = buf[2], buf[3:2 + n]
                buf = buf[2 + n:]
                if t in (MAP_WRITE, BANK_WRITE):
                    writes += 1
                elif writes:
                    log(f"[3334] ... {writes} write chunks received")
                    writes = 0
                if t not in (MAP_READ, MAP_WRITE, BANK_WRITE):   # writes: one summary line
                    log(f"[3334] <- {NAMES.get(t, hex(t))} ({len(pl)} B)")
                reply = handle_map(board, t, pl)
                if reply:
                    writer.write(reply)
                    await writer.drain()
    except (ConnectionError, OSError):
        pass
    log("[3334] client disconnected")
    writer.close()


def handle_map(board, t, pl):
    """Answer one MAP frame like dbg_server.c (no reply to the write chunks)."""
    if t == MAP_WRITE and len(pl) >= 4:
        addr, count = struct.unpack_from("<HH", pl)
        for i, b in enumerate(pl[4:4 + count]):
            board.mem[(addr + i) & 0xFFFF] = b
    elif t == MAP_MODE and len(pl) >= 5:
        start, length = struct.unpack_from("<HH", pl)
        board.set_mode(start, length, pl[4] & 3)
        return frame(MAP_ACK, bytes([MAP_MODE]))
    elif t == MAP_CLEAR and len(pl) >= 4:
        start, length = struct.unpack_from("<HH", pl)
        board.set_mode(start, length, 0)
        return frame(MAP_ACK, bytes([MAP_CLEAR]))
    elif t == MAP_LIST:
        r = board.regions()
        return frame(MAP_INFO, bytes([len(r)]) + b"".join(struct.pack("<HHB", *x) for x in r))
    elif t == BANK_WRITE and len(pl) >= 6:
        off, count = struct.unpack_from("<IH", pl)
        if off + count > BANK_POOL:
            return frame(MAP_ERR, bytes([BANK_WRITE, 1]))
        board.pool[off:off + count] = pl[6:6 + count]
    elif t == BANK_CONFIG:
        if len(pl) < 19:
            return frame(MAP_ERR, bytes([BANK_CONFIG, 0xFF]))
        win, first, npages, mode = pl[0], pl[1], pl[2], pl[3]
        base, size = struct.unpack_from("<II", pl, 4)
        if win >= BANK_WINDOWS:
            return frame(MAP_ERR, bytes([BANK_CONFIG, 1]))
        if base + size > BANK_POOL:
            return frame(MAP_ERR, bytes([BANK_CONFIG, 3]))
        nb = min(255, size // (npages * 256)) if npages else 0
        board.banks[win] = {"first": first, "npages": npages, "nbanks": nb, "cur": pl[18] % max(1, nb), "switches": 0}
        log(f"[3334]    window {win}: {first << 8:04X}-{((first + npages) << 8) - 1:04X}, {nb} banks")
        return frame(MAP_ACK, bytes([BANK_CONFIG]))
    elif t == BANK_CLEAR and len(pl) >= 1:
        for w in range(BANK_WINDOWS):
            if pl[0] in (0xFF, w):
                board.banks[w] = None
        return frame(MAP_ACK, bytes([BANK_CLEAR]))
    elif t == BANK_STATE:
        out = bytes([BANK_WINDOWS])
        for w, b in enumerate(board.banks):
            b = b or {"first": 0, "npages": 0, "nbanks": 0, "cur": 0, "switches": 0}
            out += struct.pack("<BBBBBBI", w, 1 if board.banks[w] else 0, b["first"], b["npages"],
                               b["nbanks"], b["cur"], b["switches"] & 0xFFFFFFFF)
        return frame(BANK_INFO, out)
    elif t == MAP_READ and len(pl) >= 5:
        rid, addr, length, src = pl[0], struct.unpack_from("<H", pl, 1)[0], pl[3], pl[4]
        if length == 0 or length > MAP_READ_MAX or src > 1:
            return frame(MAP_ERR, bytes([MAP_READ, 1, rid]))
        board.tick()
        data = bytes(board.mem[(addr + i) & 0xFFFF] for i in range(length))
        return frame(MAP_DATA, bytes([rid]) + struct.pack("<HBB", addr, length, src) + data)
    return None


HELP = """commands of the simulator (the real firmware has many more, see docs/firmware.md):
  ?            this help
  go / st      start / stop the (pretend) emulation
  re           CPU reset
  net          network status
  spd [s]      speed (fixed answer)
  bank         bank windows
  dm <addr> [len]   display the simulated memory
"""


async def con_client(board, reader, writer, state):
    """Port 3335: text console, one client at a time like the firmware."""
    if state.get("writer"):
        log("[3335] new client: closing the previous one")
        state["writer"].close()
    state["writer"] = writer
    peer = writer.get_extra_info("peername")
    log(f"[3335] client connected {peer[0]}:{peer[1]}")

    def out(s):
        writer.write(s.replace("\n", "\r\n").encode("latin-1", "replace"))

    out("\n*** MACT - Multiple Arcade & Computer Tester (TCP) ***  [SIMULATOR]\n")
    out("emulation RUNNING - '?' for help\n" if board.running else "emulation STOPPED - 'go' to start, '?' for help\n")
    out("> ")
    await writer.drain()
    try:
        while True:
            line = await reader.readline()
            if not line:
                break
            cmd = line.decode("latin-1").strip()
            if not cmd:
                out("> ")
                continue
            log(f"[3335] <- {cmd}")
            out(console(board, cmd))
            out("> ")
            await writer.drain()
    except (ConnectionError, OSError):
        pass
    log("[3335] client disconnected")
    if state.get("writer") is writer:
        state["writer"] = None
    writer.close()


def console(board, cmd):
    """Answer one console command."""
    w = cmd.split()
    c = w[0].lower()
    if c == "?":
        return HELP
    if c == "go":
        board.running = True
        return "emulation RUNNING\n"
    if c == "st":
        board.running = False
        return "emulation STOPPED\n"
    if c == "re":
        return "CPU reset requested\n"
    if c == "net":
        return f"NET: simulator on {local_ip()}, ports 3334 (MAP) and 3335 (console)\n"
    if c == "spd":
        return "spd: simulator, no CPU emulated (on the real board: emulated MHz and % of the real clock)\n"
    if c == "bank":
        lines = [f"win {i}: {b['first'] << 8:04X}-{((b['first'] + b['npages']) << 8) - 1:04X}, "
                 f"{b['nbanks']} banks, CURRENT {b['cur']}, switches {b['switches']}"
                 for i, b in enumerate(board.banks) if b]
        return ("\n".join(lines) or "no bank window (configure it with MACT Studio)") + "\n"
    if c == "dm":
        try:
            addr = int(w[1], 16) & 0xFFFF
            length = int(w[2], 16) if len(w) > 2 else 0x40
        except (IndexError, ValueError):
            return "usage: dm <addr> [len]  (hex)\n"
        board.tick()
        rows = []
        for a in range(addr, min(0x10000, addr + length), 16):
            chunk = board.mem[a:min(a + 16, addr + length)]
            rows.append(f"{a:04X}: " + " ".join(f"{b:02X}" for b in chunk))
        return "\n".join(rows) + "\n"
    return f"unknown command: {cmd}  ('?' for help)\n"


def local_ip():
    """LAN address of this machine (the one to type in MACT Studio)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("192.0.2.1", 9))     # documentation address: nothing is sent
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


async def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--bind", default="0.0.0.0", help="address to listen on (default: all)")
    ap.add_argument("--map-port", type=int, default=3334)
    ap.add_argument("--con-port", type=int, default=3335)
    a = ap.parse_args()
    board, con_state = Board(), {}
    s1 = await asyncio.start_server(lambda r, w: map_client(board, r, w), a.bind, a.map_port)
    s2 = await asyncio.start_server(lambda r, w: con_client(board, r, w, con_state), a.bind, a.con_port)
    log(f"MACT board simulator listening on ports {a.map_port} (MAP) and {a.con_port} (console)")
    log(f"In MACT Studio use host {local_ip()} (from another computer) or 127.0.0.1 (same computer)")
    async with s1, s2:
        await asyncio.gather(s1.serve_forever(), s2.serve_forever())


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
