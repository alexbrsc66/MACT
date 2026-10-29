# Changelog

## [1.0.0] - 2026-10-29

First public release.

- Firmware `MACT-firmware-1.0.0.hex` for NUCLEO-H723ZG: 6502 and Z80 cores with
  real bus cycles, internal ROM/RAM mapping, bank windows, serial and TCP debug
  monitor, network ROM loader, DHCP / static IP. Tested on an Arkanoid board
  (Z80) and an Atari Sprint 2 board (6502).
- Adapter PCB rev 1.0: schematic, PCB, gerbers, BOM, renders, assembly notes,
  documented hand modifications (D1 and A14 wires, optional /SYNC - /M1 wire)
  and NUCLEO modifications (SB73 open, LD2 removed, CN11 header), photos,
  3D-printable DIP-40 pin protector.
- MACT Studio 1.0.0 for Windows (installer and portable) and macOS (universal
  .dmg): ROM/RAM loader, bank windows, memory watch, terminal. On macOS the app
  is ad-hoc signed by the build, so the system can grant it the Local Network
  permission; socket errors (for example `EHOSTUNREACH`) are shown in the
  status bar and in the terminal.
- `tools/mact_board_sim.py`: board simulator to try MACT Studio without a board.
- Demos for the Arkanoid (Z80) and Sprint 2 (6502) boards.
