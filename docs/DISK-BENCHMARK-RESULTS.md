# Disk benchmark: FATRIOT vs internal Mac SSD

Raw device throughput, **not** a database benchmark. Identical workload on each
target via `scripts/disk-bench.sh` → `scripts/disk_bench.py`, which uses
macOS `F_NOCACHE` so every pass hits the device instead of the unified buffer
cache (no `sudo purge` required). 2 GiB sequential payload, 8 MiB blocks, 3
passes (median). Machine: Mac17,2, 10-core, 16 GB.

> **The cable mattered more than anything else.** FATRIOT was first tested through
> a USB-C cable that turned out to be **USB 2.0 data-only** (480 Mbit/s). Swapping
> to a TB5 cable let the same drive negotiate **USB 3.2 Gen 2 (10 Gbit/s)** and
> improved sequential by ~15× and 4 KiB random reads by ~150×. Lesson: an SSD can
> masquerade as a junk thumb drive purely because of a charge-grade cable.

## What the two targets actually are

| | Internal | FATRIOT |
|---|---|---|
| Device | Apple internal NVMe SSD | Patriot Memory 512 GB USB SSD |
| Bus | Apple Fabric (PCIe) | USB 3.2 Gen 2, 10 Gbit/s (`Device Speed = 4`) |
| `diskutil` Solid State | Yes | "Info not available" (USB bridge hides it) |

FATRIOT is a real external SSD, **not** a thumb drive — the first round's
thumb-drive-tier numbers were a USB-2.0-cable artifact.

## Results (TB5 cable — current)

Raw CSV: `docs/disk-bench-results-tb5.csv`.

| Metric | Internal SSD | FATRIOT | Internal advantage |
|---|--:|--:|--:|
| Sequential write | **6 335 MB/s** | 561 MB/s | ~11× |
| Sequential read | **5 138 MB/s** | 707 MB/s | ~7× |
| 4 KiB random read | **15 220 IOPS** (0.07 ms) | 3 804 IOPS (0.26 ms) | ~4× |

## First round (USB 2.0 cable — for contrast)

Raw CSV: `docs/disk-bench-results.csv`.

| Metric | FATRIOT @ USB 2.0 | FATRIOT @ USB 3.2 (TB5) | Cable gain |
|---|--:|--:|--:|
| Sequential write | 39 MB/s | 561 MB/s | ~14× |
| Sequential read | 37 MB/s | 707 MB/s | ~19× |
| 4 KiB random read | 26 IOPS (38 ms) | 3 804 IOPS (0.26 ms) | ~146× |

## Why

- **Sequential was capped by the link, not the flash.** 480 Mbit/s minus protocol
  overhead is ~35–45 MB/s of real payload, and round one sat right on that wall.
  At USB 3.2 Gen 2 the drive does ~700 MB/s read / ~560 MB/s write — now bounded by
  its own controller/flash, still short of the ~1 GB/s link ceiling.
- **Random I/O was *also* the link, not the media** (corrected from the first
  write-up). USB 2.0 uses Bulk-Only Transport — one command at a time, large
  round-trip turnaround, no command queuing — so each 4 KiB read paid ~38 ms of
  protocol latency. USB 3.2 with UASP pipelines commands, so random reads jumped
  ~146× to 3 804 IOPS. The flash was never the bottleneck the first round implied.

## Implication for the DB benchmark (measured)

Re-ran `scripts/db-bench.sh` on the TB5 link (results: `/Volumes/FATRIOT/bench-results-tb5.csv`).
The cable only moves **cold** (first-run, disk-bound) times — **warm** times are
served from Postgres's 2 GB buffer cache / OS cache and are unchanged within noise.

Cold-scan gains, USB 2.0 → TB5:

| Query | PG cold (USB 2.0 → TB5) |
|---|--:|
| `city_prov_count` | 35.5 s → 2.8 s (**12.5×**) |
| `street_prefix` | 40.3 s → 11.2 s (3.6×) |
| `top20_cities` | 112 s → 53 s (2.1×) |
| `distinct_postal` | 3.6 s → 0.73 s (5.0×) |

The gain tracks the **access pattern**, not a flat multiplier:

- **Postgres heap scans improved only ~2–12×.** `top20_cities` (un-indexed full
  5.3 GB heap scan) is still ~53 s cold ≈ ~100 MB/s effective, far below the drive's
  707 MB/s sequential. Postgres reads the heap in 8 KB blocks, so those scans are
  **IOPS/latency-bound**, and USB latency caps how much the wider pipe helps.

So the original "35–112 s cold" numbers in `docs/BENCHMARK-RESULTS.md` were partly a
USB-2.0-cable artifact, but Postgres full-heap scans stay slow on *any* USB link
because they're latency-bound, not bandwidth-bound.

> Gotcha found while re-running: restarting Postgres with the bare `pg_ctl ... -o "-p $PGPORT -k /tmp"`
> command from `FATRIOT-SETUP.md` loses the runtime tuning (`shared_buffers`,
> `work_mem`, …), which silently detunes the server (e.g. `work_mem=4MB` makes the
> `city_fuzzy` bitmap go lossy → 64 s instead of 0.23 s). The tuning is now persisted
> via `ALTER SYSTEM`, so a plain restart keeps `shared_buffers=2GB` / `work_mem=256MB`.

## Reproduce

```bash
scripts/disk-bench.sh                       # writes docs/disk-bench-results.csv
CSV=docs/disk-bench-results-tb5.csv scripts/disk-bench.sh
SIZE_MB=4096 PASSES=5 scripts/disk-bench.sh # heavier run
```
