# FATRIOT link speed & cabling: USB 3.2 Gen 2 (10 Gbps)

Findings on how the FATRIOT drive (a **Patriot PXD** external SSD) connects to the
Mac: the negotiated link speed, how cables affect it, why it shows up as a USB
mass-storage device, and the cheapest cable that still hits full speed. For raw
device throughput numbers see `docs/DISK-BENCHMARK-RESULTS.md`; for the DB setup
see `docs/FATRIOT-SETUP.md`.

## TL;DR

- The drive's external interface is **USB 3.2 Gen 2 = 10 Gbit/s** — confirmed by macOS reporting `Device Speed = 4` (SuperSpeed+).
- **The cable type above 10 Gbps is irrelevant.** A Thunderbolt 5 and a Thunderbolt 3 cable both negotiate the same 10 Gbps, because the drive can't go faster.
- It enumerates as **USB mass storage (BOT)** because of the USB-to-NVMe bridge in the enclosure. **You cannot change this in software** — it's a hardware property.
- **Cheapest cable for full speed: any `USB 3.2 Gen 2` / "SuperSpeed USB 10Gbps" USB-C–to–USB-C cable** (~$8–12). The one bundled with the PXD already qualifies.

## Verified link speed

Read straight from the I/O registry:

```bash
ioreg -r -c IOUSBHostDevice -w0 -l | grep -iE "patriot|\"Device Speed\"|\"USBPortType\""
```

Result: `Device Speed = 4`, `USBPortType = 5` for `Patriot Memory`
(`idVendor=0x13FE` "PXD", `idProduct=0x2570`, S/N `…35DA09000011`).

macOS `Device Speed` enum:

| Value | Mode | Speed | USB name |
|---|---|---|---|
| 0 | Low | 1.5 Mb/s | USB 1.0 |
| 1 | Full | 12 Mb/s | USB 1.1 |
| 2 | High | 480 Mb/s | USB 2.0 |
| 3 | SuperSpeed | 5 Gb/s | USB 3.2 Gen 1 |
| **4** | **SuperSpeed+** | **10 Gb/s** | **USB 3.2 Gen 2** ← FATRIOT |
| 5 | SuperSpeed+ x2 | 20 Gb/s | USB 3.2 Gen 2x2 |

10 Gb/s ≈ 1,250 MB/s theoretical wire, ~1,000–1,100 MB/s realistic after USB
overhead — which matches Patriot's rated ~1,000 MB/s read/write.

## Cable comparison

Re-checked the link with two different high-end cables; both negotiate the
identical 10 Gbps. The cable only matters when it's *below* the drive's ceiling.

| Metric | Original cable (Thunderbolt 5) | New cable (Thunderbolt 3) |
|---|---|---|
| `Device Speed` | 4 | 4 |
| Link / wire speed | 10 Gb/s | 10 Gb/s |
| USB standard | USB 3.2 Gen 2 (SuperSpeed+) | USB 3.2 Gen 2 (SuperSpeed+) |
| `USBPortType` | 5 | 5 |

> Contrast with the earlier USB-2.0 charge-grade cable documented in
> `docs/DISK-BENCHMARK-RESULTS.md`, which capped the drive at 480 Mb/s and made a
> real SSD look like a junk thumb drive. The lesson runs both ways: a *too-slow*
> cable cripples it; a *Thunderbolt* cable adds nothing over a 10 Gbps USB cable.

### Cheapest cable for maximum speed

You only need a **USB 3.2 Gen 2 (10 Gbps) USB-C-to-USB-C** cable. Thunderbolt is
overkill and wasted money here.

| Cable type | Max link | Enough for PXD (10 Gbps)? | Cost |
|---|---|---|---|
| USB 2.0 C-to-C | 480 Mb/s | No (cripples it) | cheapest |
| USB 3.2 Gen 1 (5 Gbps) C-to-C | 5 Gb/s | No (half speed) | cheap |
| **USB 3.2 Gen 2 (10 Gbps) C-to-C** | **10 Gb/s** | **Yes — exact match** | **~$8–12** |
| Thunderbolt 3/4/5 C-to-C | 40–80 Gb/s | Yes (wasted headroom) | expensive |

Buying checklist:
- Must say **"10Gbps" / "USB 3.2 Gen 2" / "USB 3.1 Gen 2 / SuperSpeed+"**.
- **Avoid USB 2.0 charge cables** (most bundled C-to-C cables) → 480 Mb/s.
- **Avoid 5 Gbps "Gen 1"** cables → half speed.
- Keep it **short (≤1 m)**; long passive cables silently drop to 5 Gbps / USB 2.0.
- On the MacBook use **C-to-C** (no USB-A port). The bundled PXD C-to-C cable works.

## Why it enumerates as USB mass storage (and can you change it?)

The drive binds to Apple's `IOUSBMassStorageDriver` with:

```text
bInterfaceClass    = 8     # Mass Storage
bInterfaceSubClass = 6     # SCSI transparent command set
bInterfaceProtocol = 0x50  # Bulk-Only Transport (BOT), not UASP (0x62)
```

Why: the PXD is an M.2 PCIe SSD sitting behind a **USB-to-NVMe bridge controller**
inside the enclosure. That bridge advertises itself to the host using the standard
**USB Mass Storage Class**, and macOS binds the matching driver. How a device
enumerates is baked into its firmware/descriptors — decided by the bridge chip, not
by the OS, the cable, or any setting.

**Can you change it? Not in software — no.** A reformat or driver change can't turn
a USB device into an NVMe/Thunderbolt one. Options are hardware-only:

1. If the PXD's M.2 stick is removable, move it into a **Thunderbolt/USB4 NVMe
   enclosure** → it would enumerate as NVMe over PCIe and exceed 10 Gbps.
2. Use a **native Thunderbolt/USB4 SSD**.

Notes:
- Even **UASP** (faster USB protocol) wouldn't beat 10 Gb/s — it only cuts
  overhead. This bridge offers only **BOT**, so macOS can't pick UASP anyway.
- `diskutil`'s `Solid State: Info not available` / no SMART passthrough is
  consistent with a simple USB bridge that hides the underlying NVMe identity.

## Product spec (Patriot PXD, PXD512GPEC)

- **Internal:** PCIe gen 3 x4 NVMe controller (fast — but internal only).
- **External interface:** USB 3.2 Gen 2 Type-C, **bus speed up to 10 Gbit/s**.
- **Rated sequential:** up to ~1,000 MB/s read and write (ATTO/CDM).
- Ships with Type-C-to-Type-C and Type-C-to-Type-A cables; 512 GB; 35 g.

The key takeaway: the internal PCIe gen3 x4 does **not** set the wire speed — the
**USB 3.2 Gen 2 bridge does (10 Gbps)**. That is the hard ceiling for this device.

## Throughput spot-check

A quick `dd` spot-check this session showed ~784 MB/s write / ~810 MB/s read, but
those were partly served from cache (couldn't `purge`/unmount while Postgres held
the volume). The **authoritative** device numbers use `F_NOCACHE` and live in
`docs/DISK-BENCHMARK-RESULTS.md` (≈561 MB/s write, ≈707 MB/s read sequential).
Either way the drive is bounded by its **own controller/flash**, below the 10 Gbps
link ceiling — so the cable is not the bottleneck.

## Re-checking link speed / starting the DB

Re-check the negotiated speed any time:

```bash
ioreg -r -c IOUSBHostDevice -w0 -l | grep -iE "patriot|\"Device Speed\""
# Device Speed = 4  ->  10 Gb/s (USB 3.2 Gen 2)
```

Start/stop the FATRIOT Postgres cluster with the lifecycle scripts:

```bash
scripts/db-start.sh    # start (initializes the cluster on first run)
scripts/db-stop.sh     # stop
```

`db-start.sh` verifies the drive is mounted (via `db-mount.sh`) and initializes
the cluster on first run with `db-init.sh`.
