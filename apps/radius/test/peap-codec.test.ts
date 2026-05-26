import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { decodePeap, encodePeap, PeapFlag } from "../src/protocol/peap.js";

describe("PEAP codec", () => {
  it("round-trips a fragment with L=1, M=1, version=0", () => {
    const tls = Buffer.from([0x16, 0x03, 0x01, 0x02, 0x00]);
    const wire = encodePeap({
      version: 0,
      lengthIncluded: true,
      moreFragments: true,
      start: false,
      totalLength: 1024,
      tls,
    });
    const decoded = decodePeap(wire);
    assert.equal(decoded.version, 0);
    assert.equal(decoded.lengthIncluded, true);
    assert.equal(decoded.moreFragments, true);
    assert.equal(decoded.start, false);
    assert.equal(decoded.totalLength, 1024);
    assert.deepEqual(decoded.tls, tls);
  });

  it("round-trips an empty Start packet", () => {
    const wire = encodePeap({
      version: 0,
      lengthIncluded: false,
      moreFragments: false,
      start: true,
      tls: Buffer.alloc(0),
    });
    assert.equal(wire.length, 1);
    assert.equal(wire[0] & PeapFlag.Start, PeapFlag.Start);
    const decoded = decodePeap(wire);
    assert.equal(decoded.start, true);
    assert.equal(decoded.tls.length, 0);
  });

  it("round-trips an empty ACK packet", () => {
    const wire = encodePeap({
      version: 0,
      lengthIncluded: false,
      moreFragments: false,
      start: false,
      tls: Buffer.alloc(0),
    });
    assert.equal(wire.length, 1);
    assert.equal(wire[0], 0);
    const decoded = decodePeap(wire);
    assert.equal(decoded.tls.length, 0);
    assert.equal(decoded.lengthIncluded, false);
  });

  it("rejects an L=1 packet with truncated length field", () => {
    // Flag says L=1 but only 3 bytes of length follow.
    assert.throws(() => decodePeap(Buffer.from([PeapFlag.Length, 0, 0, 0])));
  });

  it("preserves version bits", () => {
    for (const v of [0, 1, 2]) {
      const wire = encodePeap({
        version: v,
        lengthIncluded: false,
        moreFragments: false,
        start: false,
        tls: Buffer.alloc(0),
      });
      assert.equal(decodePeap(wire).version, v);
    }
  });
});
