![MACT - Multiple Arcade & Computer Tester](docs/images/mact-banner.jpg)

# MACT - Multiple Arcade & Computer Tester

*[Read in English](README.md)*

MACT sostituisce la CPU di una **vera scheda arcade** con un microcontrollore
STM32H723 (NUCLEO-H723ZG). Un core 6502 o Z80 gira in software, ma ogni accesso
a memoria e I/O è un **vero ciclo di bus** sullo zoccolo della CPU, temporizzato
dal clock della scheda stessa. ROM, RAM, video e audio della scheda vedono una
CPU funzionante, mentre tu hai dall'esterno un monitor di debug, un caricatore
di ROM via rete e strumenti sulla memoria.

![Adattatore MACT, vista dall'alto](hardware/MACT-adapter-rev1.0-top.png)

## Cosa puoi fare

- **Far girare una scheda senza la sua CPU**: Z80 e 6502 (scelta con un jumper).
- **Servire le ROM dal microcontrollore**: carichi le ROM del gioco via rete
  nella memoria interna e togli le EPROM dalla scheda. Le zone ROM a banchi
  sono supportate ("finestre a banchi" configurabili).
- **Fare debug della scheda dal vivo**: lettura e modifica della memoria,
  disassembler, passo-passo, registri, log dell'I/O, CRC delle ROM, test della
  RAM, test di stabilità del bus.
- **Guardare la memoria mentre il gioco gira** dall'app PC, con un terminale
  nella stessa finestra.
- **Far girare codice tuo** sulla scheda: vedi le [demo](demos/).

Provato finora: una scheda Arkanoid (Z80) gira al 99,9% del clock reale
con tutte le ROM servite dal microcontrollore, e una scheda Atari Sprint 2 (6502)
gira al 99,7% del clock reale, sia col gioco sia con la demo.

![La Nucleo su una scheda arcade, zoccoli delle EPROM vuoti: le ROM le fornisce il microcontrollore](docs/images/mact-on-board.jpg)

## Contenuto del repository

| Cartella | Contenuto |
|---|---|
| [`firmware/`](firmware/) | firmware pronto da caricare (`.hex`) per la NUCLEO-H723ZG |
| [`hardware/`](hardware/) | PCB adattatore rev 1.0: PDF di schema e PCB, gerber, distinta, rendering, modifiche a mano necessarie |
| [`app/`](app/) | **MACT Studio**, l'applicazione PC (Windows / macOS): sorgenti; installer nelle [Release](https://github.com/alexbrsc66/MACT/releases) |
| [`docs/`](docs/) | [guida rapida a MACT Studio](docs/mact-studio.md), [guida al firmware](docs/firmware.md) (in inglese), [protocollo di rete](docs/protocol.md) |
| [`demos/`](demos/) | programmi demo per le schede Arkanoid e Sprint 2 |
| [`LICENSES/`](LICENSES/) | licenze di terze parti del codice contenuto nel firmware |
| [`tools/`](tools/) | [simulatore della scheda](tools/mact_board_sim.py): per provare MACT Studio senza scheda |

In questa prima versione i sorgenti del firmware non sono pubblicati.

## Partenza rapida

1. Costruisci o ordina l'[adattatore](hardware/) e fai le modifiche a mano
   all'adattatore e alla Nucleo (vedi le [note sull'hardware](hardware/README.md)).
2. Carica [`firmware/MACT-firmware-1.0.0.hex`](firmware/): collega la porta USB
   ST-Link della Nucleo e copia il file nel disco `NOD_H723ZG`.
3. Imposta JP2 per la CPU (aperto = 6502, chiuso = Z80), togli la CPU dalla
   scheda, inserisci l'adattatore nello zoccolo, accendi la scheda.
4. Apri la porta COM virtuale dell'ST-Link a **115200 8N1** e scrivi `?` per
   l'aiuto, `go` per partire. La stessa console è sulla porta TCP 3335.

Tutti i dettagli nella [guida al firmware](docs/firmware.md).

Non hai la scheda sottomano? Lancia il simulatore su un computer qualsiasi con
Python 3 (`python3 tools/mact_board_sim.py`): risponde a MACT Studio come il
firmware (caricamento ROM, finestre a banchi, watch, console) e stampa
l'indirizzo a cui collegarsi.

## Compatibilità elettrica

La STM32 funziona a **3,3 V**. I pin del bus tollerano i 5 V, quindi legge
senza problemi i segnali a 5 V della scheda, ma i segnali che pilota lei
(indirizzi, dati in scrittura, segnali di controllo) arrivano solo a circa 3,3 V.

- **Funziona:** logica TTL (74LS, 74S, 74F), 74HCT / 74ACT, chip NMOS e la
  maggior parte di EPROM e RAM, che vedono un livello alto già da circa 2 V.
  Tutte le schede provate finora usano questo tipo di logica.
- **Non garantito:** logica CMOS a 5 V con soglie CMOS (74HC, 74AC, serie
  4000), che vuole circa 3,5 V per un livello alto: 3,3 V sono al limite o
  sotto, e la scheda potrebbe leggere male i segnali della CPU. Una scheda così
  avrebbe bisogno di traslatori di livello (per esempio 74HCT245 / 74HCT541) fra
  l'adattatore e lo zoccolo; l'adattatore rev 1.0 non li ha.
- La tolleranza ai 5 V vale solo con la Nucleo alimentata: accendila insieme
  alla scheda e non mandare mai segnali a 5 V a una Nucleo spenta.

## Licenza

MACT è distribuito con la [PolyForm Noncommercial License 1.0.0](LICENSE):
libero per uso personale, hobbistico, di ricerca e didattico; l'uso
commerciale non è consentito senza autorizzazione. I componenti di terze parti
mantengono le proprie licenze, elencate in [`LICENSES/`](LICENSES/).

**Le ROM dei giochi non sono incluse e non vanno ridistribuite.** Usa solo ROM
che hai il diritto di usare.
