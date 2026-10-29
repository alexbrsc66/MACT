# MACT firmware - user guide

Firmware for the NUCLEO-H723ZG (STM32H723ZG, Cortex-M7 at 550 MHz) mounted on
the [MACT adapter](../hardware/). It replaces the CPU of an arcade board: the
6502 or Z80 core runs in software and every memory and I/O access is a real
bus cycle on the CPU socket, paced by the board's own clock.

## Features

- **Two CPU cores**, selected at boot by jumper JP2: NMOS 6502 and Z80.
- **Real bus cycles**
  - 6502: generated on every edge of PHI0 from the board, with PHI1/PHI2 out.
    RDY is honoured (read cycles are stretched while RDY is low).
  - Z80: memory and I/O cycles following the Zilog timing, `/WAIT` sampled,
    interrupt-acknowledge cycle for IM 1 / IM 2.
- **Memory model** shared by both CPUs: a 64 KB internal image, with a mode for
  each 256-byte page: hardware (real bus), internal ROM, internal RAM, or RAM
  mirrored to the bus. Internal ROM pages make no bus cycle, so the board can
  run with its EPROMs removed.
- **Bank windows**: up to 4 bank-switched CPU ranges served from a 64 KB image
  pool. The firmware watches the CPU writes to the board's bank register and
  switches the bank like the real hardware (the write still reaches the board).
- **Debug monitor** on the ST-Link virtual COM port (115200 8N1) and, with the
  same commands, on TCP port 3335.
- **Network**: DHCP by default or static IP, MAC address derived from the chip
  unique ID (several boards can share a network without setup). Settings are
  kept in flash.

## Flashing (no development tools needed)

- **Drag and drop:** connect the Nucleo ST-Link USB port. The board shows up as
  a USB drive (named like `NOD_H723ZG`); copy `MACT-firmware-<version>.hex`
  onto it. The ST-Link programs the MCU and restarts it.
- **STM32CubeProgrammer** (free, from st.com): connect via ST-Link, open the
  `.hex`, *Download*.

Check the file against `SHA256SUMS` in the repository root if you want to be
sure it is intact.

The network settings live in flash sector 7, outside the firmware image. A
full chip erase resets them to the default (DHCP, MAC from the chip UID): set
them again with `ip` / `dhcp` / `mac`.

## Pin map

| Signal | Nucleo pin | 6502 | Z80 |
|---|---|---|---|
| Clock in | PC0 | PHI0 | CLK |
| Address bus | PE0-PE15 | A0-A15 | A0-A15 |
| Data bus | PD0-PD7 | D0-D7 | D0-D7 |
| R/W | PF0 | R/W | /WR |
| Reset | PF1 | /RES | /RESET |
| NMI | PF2 | /NMI | /NMI |
| IRQ | PG3 | /IRQ | /INT |
| Ready / wait | PG2 | RDY | /WAIT |
| Clock out 1 | PG0 | PHI1 out | /BUSRQ (input) |
| Clock out 2 | PG1 | PHI2 out | /BUSAK (output, held high) |
| Z80 only | PG12 / PA0 / PF4 / PF8 | - | /MREQ / /IORQ / /RD / /RFSH |
| Opcode fetch | PB1 (CN9-7, hand wire) | SYNC out | /M1 out |

> **Adapter rev 1.0:** the D1 net is routed to CN9-26 (PF7) and must be
> bodged to PD1, and the A14 net is routed to CN10-28 and must be bodged to
> CN10-8 (PE14), see the [hardware notes](../hardware/README.md). PF6/PF7 are
> kept as inputs by the firmware.
>
> **Nucleo board:** open solder bridge **SB73** (CN10-28 = PE6) and remove LED **LD2** (PE1 = A1),
> see the [hardware notes](../hardware/README.md#required-nucleo-h723zg-modifications).

## Jumpers

Both use the internal pull-up: open = 1, closed to GND = 0.

| Jumper | Pin | Function |
|---|---|---|
| JP2 | PF9 (CN9-28) | CPU type: open = 6502, closed = Z80 |
| JP1 | PA3 (CN9-1) | autostart: closed = the emulation starts at power-on (if the board clock is present); open = it starts stopped, type `go` |

## Getting started

1. Select the CPU with JP2, remove the CPU from the board, plug the adapter
   into the CPU socket, power the board.
2. Open the ST-Link virtual COM port at 115200 8N1 (any terminal program).
   At boot the monitor prints the network status, the TCP ports, the CPU type,
   the measured clock, the build options and the reset state.
3. Type `go` to start the emulation (or close JP1 for autostart), `?` for help.

Example boot output (Z80):

```
*** MACT - Multiple Arcade & Computer Tester ***
NET: MAC 02:xx:xx:xx:xx:xx, hostname mact-xxxxxx
NET: link UP, DHCP waiting for an address...
TCP: text console port 3335 OK (PuTTY Raw or telnet <IP> 3335), ROM loader port 3334 OK
CPU: Z80 (jumper JP2 closed)
CPU CLK (PC0): 5.907 MHz (polling 1 ms)
Bus options: /M1 on PB1 OFF, refresh OFF (Z80_BUS_M1=0, Z80_BUS_RFSH=0)
Reset: PC=0000
Start: emulation STOPPED - 'go' to start (JP1 closed = autostart)
'?' for help
>
NET: link UP, IP 192.168.1.23 (DHCP) - console: telnet 192.168.1.23 3335
```

Without a DHCP server (board connected straight to a PC) the board gets no
address: set one with `ip 192.168.1.11` and give the PC an address in the same
subnet.

## Monitor commands

All values are hexadecimal, except IP addresses (decimal). `.` repeats the last
command.

| Command | Description |
|---|---|
| `dm <addr> [len]` | display memory |
| `mm <addr> <val>` | modify a byte (real bus write) |
| `fm <addr> <len> <val>` | fill memory |
| `map <addr> <len> <mode>` | page mode: 0 = hardware, 1 = ROM, 2 = RAM, 3 = RAM mirrored to the bus |
| `mapf <addr> <len> <val>` | fill the internal image |
| `mapl` | list mapped pages |
| `bank [<win> <n>]` | bank windows: status, or force bank n |
| `iow <port> <val>` / `ior <port>` | Z80 I/O write / read on the bus |
| `di <addr> [n]` | disassemble n instructions (6502 or Z80) |
| `rg` | registers and current instruction |
| `pc [addr]` | show / set the program counter |
| `st` / `go` | stop / start the emulation |
| `si [n]` | step n instructions (while stopped) |
| `re` | CPU reset |
| `nmi` / `irq` | arm a single NMI / IRQ |
| `clk` | measure the bus clock on PC0 |
| `spd [s]` | effective speed over s seconds (emulated MHz, instructions/s, IRQ/s) |
| `iol [m]` | log I/O accesses in D000-DFFF while running (1 = writes, 2 = + reads, 0 = off) |
| `crc <addr> <len>` | MAME-style CRC32 of a range read from the bus |
| `crcm <addr> <len>` | CRC32 of the internal image |
| `mt <addr> <len>` | RAM test on the bus (destructive, CPU stopped) |
| `rr <addr> [n]` | read a cell n times: values and unstable bits |
| `rv <addr> <len> [p]` | read a range p times and show differences |
| `rc <addr> <len>` | compare the bus with the loaded image and explain errors |
| `sl <addr> <len> [s]` | read in a loop, pulse on PB0 on each error (scope trigger) |
| `tp [m]` | test point on PF15 (CN12-60) for an oscilloscope |
| `wdk [addr]` | write `addr` every 100 ms while stopped (feeds the board watchdog), 10000 = off |
| `net` | network status: link, mode, IP, MAC, hostname, TCP clients |
| `dhcp` | use DHCP (default), saved to flash |
| `ip <a.b.c.d> [mask] [gw]` | static IP, saved to flash (default mask 255.255.255.0, gw x.x.x.1) |
| `mac [xx:xx:xx:xx:xx:xx \| auto]` | show / set the MAC (auto = from chip UID), active after reboot |
| `reboot` | restart the MCU |

## TCP ports

| Port | Protocol | Use |
|---|---|---|
| 3335 | text | clone of the serial console, same commands. Use PuTTY in **Raw** mode or `telnet <IP> 3335`. |
| 3334 | binary | ROM/RAM loader, bank windows, memory watch reads, used by the PC app. See [protocol.md](protocol.md). |

## Compile-time options

The published `.hex` is built with the default options below; the boot message
always shows the active ones.

| Option | Default | Meaning |
|---|---|---|
| `BUS6502_RDY` | 1 | honour the 6502 RDY input (PG2) |
| `BUS6502_SYNC` | 0 | drive SYNC on PB1 (needs the hand wire) |
| `Z80_BUS_M1` | 0 | drive /M1 on PB1 (needs the hand wire) |
| `Z80_BUS_RFSH` | 0 | Z80 refresh cycle (I:R on the bus, /RFSH), for boards with DRAM |
| `ROM_BUS_CYCLE` | 0 | internal ROM pages still run the bus cycle (reads return the internal byte) |

## Known limitations

- With the ROMs on the board (every opcode fetch is a bus cycle) the Z80 runs
  at about 88% of the real clock; with the ROMs served by the MCU it reaches
  99.9%.
- `/M1` (SYNC on the 6502) and the Z80 refresh are off in the published build
  and still untested on hardware.
- `/HALT` is not driven; bus release (`/BUSRQ` - `/BUSAK`) is not implemented.
- The 6502 core ignores the decimal (D) flag (no BCD arithmetic).
- With the 6502 selected and no clock on PC0, commands that access the bus
  (`dm`, `si`, ...) wait for the clock. Boot and `go` detect the missing clock
  and do not hang.
