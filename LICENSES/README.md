# Third-party licenses

The MACT firmware (`firmware/*.hex`) contains the following third-party code.
The MACT project itself is licensed under PolyForm Noncommercial 1.0.0 (see
`LICENSE` in the repository root); these components keep their own licenses.

| Component | Author | License | File |
|---|---|---|---|
| Z80 core ([superzazu/z80](https://github.com/superzazu/z80)), locally modified | Nicolas Allemand | MIT | `z80-superzazu-MIT.txt` |
| lwIP TCP/IP stack | Swedish Institute of Computer Science and contributors | BSD-3-Clause | `LwIP-BSD-3-Clause.txt` |
| STM32H7xx HAL, CMSIS device, BSP, LAN8742 driver | STMicroelectronics | BSD-3-Clause | `STM32H7-HAL-BSP-BSD-3-Clause.txt` |
| CMSIS core | Arm Limited | Apache-2.0 | `CMSIS-Apache-2.0.txt` |

The 6502 core is original project code (no third-party source; checked
against 11 public 6502 cores), covered by the project license.

Game ROMs are not part of this repository and must not be redistributed.
