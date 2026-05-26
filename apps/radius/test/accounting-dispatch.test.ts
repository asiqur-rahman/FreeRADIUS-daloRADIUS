// ─────────────────────────────────────────────────────────────────────
//  Accounting dispatcher tests.
//
//  Uses an in-memory AcctBackend so we exercise the real parse →
//  dispatch → response code path without Postgres.
// ─────────────────────────────────────────────────────────────────────

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { AttrType } from "../src/protocol/attributes.js";
import {
  integerAttribute,
  ipv4Attribute,
  stringAttribute,
  type RadiusPacket,
} from "../src/protocol/codec.js";
import { RadiusCode } from "../src/protocol/codes.js";
import {
  handleAccountingRequest,
} from "../src/accounting/dispatch.js";
import {
  computeAcctUniqueId,
  type AcctBackend,
} from "../src/accounting/persistence.js";
import {
  AcctStatusType,
  parseAccountingRequest,
  type AccountingRequest,
} from "../src/accounting/parse.js";

const NAS = {
  id: "nas-test",
  nasname: "10.0.0.1",
  shortname: "test-nas",
  secret: "test-secret-32-aaaaaaaaaaaaaaaaaaa",
  type: "other",
  coaPort: 3799,
  enabled: true,
  siteId: null,
};

function makeBackend() {
  const upserts: AccountingRequest[] = [];
  const closeCalls: { nasIpAddress: string; cause: string }[] = [];
  let closeReturn = 0;

  const backend: AcctBackend = {
    upsertSession: async (req) => {
      upserts.push(req);
    },
    closeNasSessions: async (nasIpAddress, cause) => {
      closeCalls.push({ nasIpAddress, cause });
      return closeReturn;
    },
  };

  return {
    backend,
    upserts,
    closeCalls,
    setCloseReturn(n: number) {
      closeReturn = n;
    },
  };
}

function makePacket(extra: RadiusPacket["attributes"]): RadiusPacket {
  return {
    code: RadiusCode.AccountingRequest,
    identifier: 42,
    authenticator: Buffer.alloc(16),
    attributes: [
      stringAttribute(AttrType.UserName, "alice"),
      stringAttribute(AttrType.AcctSessionId, "sess-1"),
      ipv4Attribute(AttrType.NasIpAddress, "10.0.0.1"),
      ...extra,
    ],
  };
}

describe("accounting dispatcher", () => {
  it("acknowledges Acct-Start and upserts the session", async () => {
    const { backend, upserts } = makeBackend();
    const packet = makePacket([
      integerAttribute(AttrType.AcctStatusType, AcctStatusType.Start),
    ]);
    const reply = await handleAccountingRequest(packet, {
      nas: NAS,
      peerAddress: "10.0.0.1",
      backend,
    });
    assert.equal(reply.code, RadiusCode.AccountingResponse);
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0]?.statusType, AcctStatusType.Start);
  });

  it("forwards Interim-Update to upsertSession", async () => {
    const { backend, upserts } = makeBackend();
    const packet = makePacket([
      integerAttribute(AttrType.AcctStatusType, AcctStatusType.InterimUpdate),
      integerAttribute(AttrType.AcctInputOctets, 1024),
      integerAttribute(AttrType.AcctSessionTime, 60),
    ]);
    await handleAccountingRequest(packet, {
      nas: NAS,
      peerAddress: "10.0.0.1",
      backend,
    });
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0]?.inputOctets, 1024n);
    assert.equal(upserts[0]?.sessionTime, 60);
  });

  it("forwards Stop to upsertSession with terminate cause", async () => {
    const { backend, upserts } = makeBackend();
    const packet = makePacket([
      integerAttribute(AttrType.AcctStatusType, AcctStatusType.Stop),
      integerAttribute(AttrType.AcctTerminateCause, 1), // User-Request
      integerAttribute(AttrType.AcctSessionTime, 1800),
    ]);
    await handleAccountingRequest(packet, {
      nas: NAS,
      peerAddress: "10.0.0.1",
      backend,
    });
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0]?.terminateCause, "User-Request");
  });

  it("Accounting-On triggers closeNasSessions with NAS-Reboot", async () => {
    const { backend, closeCalls } = makeBackend();
    const packet = makePacket([
      integerAttribute(AttrType.AcctStatusType, AcctStatusType.AccountingOn),
    ]);
    await handleAccountingRequest(packet, {
      nas: NAS,
      peerAddress: "10.0.0.1",
      backend,
    });
    assert.deepEqual(closeCalls, [{ nasIpAddress: "10.0.0.1", cause: "NAS-Reboot" }]);
  });

  it("Accounting-Off triggers closeNasSessions with NAS-Request", async () => {
    const { backend, closeCalls } = makeBackend();
    const packet = makePacket([
      integerAttribute(AttrType.AcctStatusType, AcctStatusType.AccountingOff),
    ]);
    await handleAccountingRequest(packet, {
      nas: NAS,
      peerAddress: "10.0.0.1",
      backend,
    });
    assert.deepEqual(closeCalls, [{ nasIpAddress: "10.0.0.1", cause: "NAS-Request" }]);
  });

  it("acknowledges sessions without a session-id but skips persistence", async () => {
    const { backend, upserts } = makeBackend();
    const packet: RadiusPacket = {
      code: RadiusCode.AccountingRequest,
      identifier: 8,
      authenticator: Buffer.alloc(16),
      attributes: [
        stringAttribute(AttrType.UserName, "alice"),
        ipv4Attribute(AttrType.NasIpAddress, "10.0.0.1"),
        integerAttribute(AttrType.AcctStatusType, AcctStatusType.Start),
      ],
    };
    const reply = await handleAccountingRequest(packet, {
      nas: NAS,
      peerAddress: "10.0.0.1",
      backend,
    });
    assert.equal(reply.code, RadiusCode.AccountingResponse);
    assert.equal(upserts.length, 0);
  });

  it("acknowledges unknown status types without crashing", async () => {
    const { backend, upserts, closeCalls } = makeBackend();
    const packet = makePacket([integerAttribute(AttrType.AcctStatusType, 99)]);
    const reply = await handleAccountingRequest(packet, {
      nas: NAS,
      peerAddress: "10.0.0.1",
      backend,
    });
    assert.equal(reply.code, RadiusCode.AccountingResponse);
    assert.equal(upserts.length, 0);
    assert.equal(closeCalls.length, 0);
  });

  it("computeAcctUniqueId is deterministic and reflects the inputs", () => {
    const a = parseAccountingRequest(
      makePacket([integerAttribute(AttrType.AcctStatusType, AcctStatusType.Start)]),
      "10.0.0.1",
    );
    // Same logical session → same uniqueId.
    const b = parseAccountingRequest(
      makePacket([
        integerAttribute(AttrType.AcctStatusType, AcctStatusType.InterimUpdate),
        integerAttribute(AttrType.AcctInputOctets, 100),
      ]),
      "10.0.0.1",
    );
    assert.equal(computeAcctUniqueId(a), computeAcctUniqueId(b));

    // Different session-id → different uniqueId.
    const c = parseAccountingRequest(
      {
        code: RadiusCode.AccountingRequest,
        identifier: 7,
        authenticator: Buffer.alloc(16),
        attributes: [
          stringAttribute(AttrType.UserName, "alice"),
          stringAttribute(AttrType.AcctSessionId, "sess-different"),
          ipv4Attribute(AttrType.NasIpAddress, "10.0.0.1"),
          integerAttribute(AttrType.AcctStatusType, AcctStatusType.Start),
        ],
      },
      "10.0.0.1",
    );
    assert.notEqual(computeAcctUniqueId(a), computeAcctUniqueId(c));
  });
});
