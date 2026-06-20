#!/usr/bin/env python3
"""Raw sequential + random disk throughput benchmark for macOS.

Every read/write is done on a file descriptor with F_NOCACHE enabled, so the
unified buffer cache is bypassed and each pass genuinely hits the device. This
is what lets us measure true disk speed without `sudo purge` between runs.

Write/read buffers are page-aligned mmap regions (F_NOCACHE wants alignment to
avoid bounce-buffer copies). Sequential data is random bytes so an external
SSD/USB-bridge controller cannot compress its way to a fake number.

Usage:
    disk_bench.py LABEL=DIR [LABEL=DIR ...]

Env knobs:
    SIZE_MB    sequential payload per pass   (default 2048)
    BLOCK_MB   sequential block size         (default 8)
    PASSES     passes per test, median wins  (default 3)
    RAND_OPS   4 KiB random reads            (default 2000)
    CSV        write a results CSV here       (optional)
"""
import os
import sys
import time
import fcntl
import mmap
import random
import statistics

F_NOCACHE = 48  # <sys/fcntl.h>: disable data caching for this fd
PAGE = 4096

SIZE = int(os.environ.get("SIZE_MB", "2048")) * 1024 * 1024
BLOCK = int(os.environ.get("BLOCK_MB", "8")) * 1024 * 1024
PASSES = int(os.environ.get("PASSES", "3"))
RAND_OPS = int(os.environ.get("RAND_OPS", "2000"))
CSV = os.environ.get("CSV", "")

N_BLOCKS = SIZE // BLOCK
PAYLOAD = N_BLOCKS * BLOCK


def aligned_buf(nbytes):
    b = mmap.mmap(-1, nbytes)  # anonymous mmap == page aligned
    return b


def seq_write(path, wbuf):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
    try:
        fcntl.fcntl(fd, F_NOCACHE, 1)
        mv = memoryview(wbuf)
        t0 = time.monotonic()
        for _ in range(N_BLOCKS):
            off = 0
            while off < BLOCK:
                off += os.write(fd, mv[off:])
        os.fsync(fd)
        return time.monotonic() - t0
    finally:
        os.close(fd)


def seq_read(path, rbuf):
    fd = os.open(path, os.O_RDONLY)
    try:
        fcntl.fcntl(fd, F_NOCACHE, 1)
        total = 0
        t0 = time.monotonic()
        while True:
            n = os.readv(fd, [rbuf])
            if n <= 0:
                break
            total += n
        return time.monotonic() - t0, total
    finally:
        os.close(fd)


def rand_read(path, ops):
    size = os.path.getsize(path)
    hi = (size - PAGE) // PAGE
    offs = [random.randint(0, hi) * PAGE for _ in range(ops)]
    fd = os.open(path, os.O_RDONLY)
    try:
        fcntl.fcntl(fd, F_NOCACHE, 1)
        t0 = time.monotonic()
        for o in offs:
            os.pread(fd, PAGE, o)
        return time.monotonic() - t0
    finally:
        os.close(fd)


def mbps(nbytes, secs):
    return (nbytes / (1024 * 1024)) / secs


def run_dir(label, d):
    path = os.path.join(d, ".disk_bench.bin")
    wbuf = aligned_buf(BLOCK)
    wbuf.write(os.urandom(BLOCK))
    rbuf = aligned_buf(BLOCK)

    wr = [mbps(PAYLOAD, seq_write(path, wbuf)) for _ in range(PASSES)]
    rd = []
    for _ in range(PASSES):
        secs, total = seq_read(path, rbuf)
        rd.append(mbps(total, secs))
    rnd_secs = rand_read(path, RAND_OPS)
    iops = RAND_OPS / rnd_secs
    rnd_lat_ms = (rnd_secs / RAND_OPS) * 1000

    try:
        os.remove(path)
    except OSError:
        pass

    return {
        "label": label,
        "write_med": statistics.median(wr),
        "write_max": max(wr),
        "read_med": statistics.median(rd),
        "read_max": max(rd),
        "rand_iops": iops,
        "rand_lat_ms": rnd_lat_ms,
        "write_all": wr,
        "read_all": rd,
    }


def main():
    pairs = []
    for a in sys.argv[1:]:
        label, _, d = a.partition("=")
        pairs.append((label, d))
    if not pairs:
        sys.exit("usage: disk_bench.py LABEL=DIR [LABEL=DIR ...]")

    print(
        f"Sequential payload {PAYLOAD // (1024*1024)} MiB, block {BLOCK // (1024*1024)} MiB, "
        f"{PASSES} passes (median reported), F_NOCACHE (uncached).\n"
    )
    hdr = f"{'target':<10} | {'seq write MB/s':>16} | {'seq read MB/s':>16} | {'4K rand read':>14}"
    print(hdr)
    print("-" * len(hdr))

    rows = []
    for label, d in pairs:
        r = run_dir(label, d)
        rows.append(r)
        print(
            f"{r['label']:<10} | "
            f"{r['write_med']:>9.0f} (max {r['write_max']:>5.0f}) | "
            f"{r['read_med']:>9.0f} (max {r['read_max']:>5.0f}) | "
            f"{r['rand_iops']:>7.0f} IOPS"
        )

    if len(rows) == 2:
        a, b = rows
        print()
        print(
            f"{b['label']} vs {a['label']}:  "
            f"write {b['write_med']/a['write_med']:.2f}x   "
            f"read {b['read_med']/a['read_med']:.2f}x   "
            f"rand {b['rand_iops']/a['rand_iops']:.2f}x"
        )

    if CSV:
        with open(CSV, "w") as f:
            f.write("target,seq_write_med_mbps,seq_write_max_mbps,seq_read_med_mbps,"
                    "seq_read_max_mbps,rand_read_iops,rand_read_lat_ms\n")
            for r in rows:
                f.write(f"{r['label']},{r['write_med']:.1f},{r['write_max']:.1f},"
                        f"{r['read_med']:.1f},{r['read_max']:.1f},"
                        f"{r['rand_iops']:.0f},{r['rand_lat_ms']:.4f}\n")
        print(f"\nCSV: {CSV}")


if __name__ == "__main__":
    main()
