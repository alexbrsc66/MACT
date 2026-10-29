# MACT Studio <-> firmware - MAP protocol (TCP port 3334)

Frame: `[len: u16 LE][type: u8][payload]`, where `len` = number of bytes of `type + payload`.

Firmware TCP ports:
- **3334** = this MAP protocol (binary): memory configuration, bank windows, memory watch reads.
- **3335** = **text** debug console, a clone of the serial console: command lines ended by CR/LF,
  text answer followed by the prompt `> ` (no echo from the firmware; banner on connection).
  Same commands as the serial console (`?` for the list).

## PC -> firmware
| type | name | payload |
|---|---|---|
| 0x01 | MAP_WRITE | addr:u16 LE, count:u16 LE, data[count] - copy into `map_mem[addr..]` |
| 0x02 | MAP_MODE  | start:u16 LE, len:u16 LE, mode:u8 - set `page_mode` (0=hw 1=rom 2=ram 3=mirror) |
| 0x03 | MAP_CLEAR | start:u16 LE, len:u16 LE - page_mode=0 (back to the bus) |
| 0x04 | MAP_LIST  | (empty) - request the list of active regions |
| 0x05 | BANK_WRITE  | off:u32 LE, count:u16 LE, data[count] - copy into the bank pool (64 KB) at `off` |
| 0x06 | BANK_CONFIG | 19 bytes: win:u8, first_page:u8, npages:u8, mode:u8 (1=rom 2=ram), img_base:u32 LE, img_size:u32 LE, reg_addr:u16 LE, reg_mask:u16 LE, bits:u8, inv:u8, reset_bank:u8 - configure and enable the window |
| 0x07 | BANK_CLEAR  | win:u8 (0xFF = all) - disable the window, its pages go back to the bus |
| 0x08 | BANK_STATE  | (empty) - request the window state (answer BANK_INFO) |
| 0x09 | MAP_READ    | id:u8, addr:u16 LE, len:u8 (1..64; the app uses at most 16), src:u8 - read for the watch (answer MAP_DATA). src 0 = **mirror**: internal pages from internal memory (banks included), bus pages from `s_ram` (last value read/written by the CPU), no bus cycle; src 1 = **CPU view**: read like the CPU, real bus cycle on hardware pages (beware of I/O registers) |

Sequence for a region `{file, start, mode}`:
1. `MAP_WRITE` in chunks (e.g. 1024 B) to fill `map_mem`;
2. `MAP_MODE(start, len(file), mode)` to enable it.

Sequence for a bank window (after the regions):
1. `BANK_WRITE` in chunks: the file with all the banks one after the other, into the pool at `img_base`;
2. `BANK_CONFIG`: CPU window = pages `first_page .. first_page+npages-1`,
   banks = `img_size / (npages*256)`. CPU writes with
   `(addr & reg_mask) == reg_addr` still reach the board and also select the
   bank: the `bits` bits of the written value (after XOR with `inv`) are taken
   from the lowest to the highest, and the resulting number (modulo the number
   of banks) is the bank. On CPU reset the bank goes back to `reset_bank`.
   A `MAP_MODE` / `MAP_CLEAR` that touches the pages of a window disables it.

## firmware -> PC
| type | name | payload |
|---|---|---|
| 0x81 | MAP_ACK  | cmd:u8 (the type it answers) |
| 0x82 | MAP_INFO | n:u8, then n x {start:u16 LE, len:u16 LE, mode:u8} |
| 0x83 | MAP_ERR  | cmd:u8, code:u8 |
| 0x84 | BANK_INFO | n:u8, then n x {win:u8, active:u8, first_page:u8, npages:u8, nbanks:u8, cur:u8, switches:u32 LE} |
| 0x85 | MAP_DATA  | id:u8, addr:u16 LE, len:u8, src:u8, data[len] - answer to MAP_READ |

`MAP_READ` errors: `MAP_ERR [0x09, code, id]` (with the request id): code 1 =
invalid request, 2 = CPU view with no clock on the bus (the cycle would never end).

Answers to the BANK_* commands: `MAP_ACK [cmd]` if ok, `MAP_ERR [cmd, code]` on error
(`BANK_WRITE` answers only on error: code 1 = outside the pool).
`BANK_CONFIG` codes: 1 window number, 2 invalid CPU range, 3 image outside the
pool, 4 image smaller than the window, 5 no selector bit, 6 invalid mode,
7 overlaps another window, 255 short message.

Notes:
- `map_mem` is 64 KB (the whole 16-bit space of the 6502/Z80). `page_mode` is per 256-byte page, so `start`/`len` are rounded to pages by the firmware.
- Regions live in volatile RAM: after a firmware reset they must be sent again (Send all in the app).
- Bank windows: at most 4, image pool 64 KB in AXI SRAM. Volatile as well.
  On the monitor: command `bank` (state) and `bank <win> <n>` (force a bank).
- **Debug** tab of the app: watch (ranges of at most 16 bytes, refresh on demand or
  automatic every 0.5-5 s, changed bytes highlighted) via `MAP_READ`; terminal on port
  **3335** (one client only: when the app connects, a PuTTY session on 3335 is closed).
