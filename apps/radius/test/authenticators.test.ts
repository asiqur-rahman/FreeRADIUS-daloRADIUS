// Round-trip + verify tests for the three integrity mechanisms.
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { AttrType, MESSAGE_AUTHENTICATOR_VALUE_LENGTH } from "../src/protocol/attributes.js";
import {
  encode,
  decode,
  stringAttribute,
  integerAttribute,
  RADIUS_HEADER_LENGTH,
  type RadiusPacket,
  findAttribute,
} from "../src/protocol/codec.js";
import { RadiusCode } from "../src/protocol/codes.js";
import {
  computeMessageAuthenticator,
  computeRequestAuthenticator,
  computeResponseAuthenticator,
  randomAuthenticator,
  verifyMessageAuthenticator,
  verifyRequestAuthenticator,
  verifyResponseAuthenticator,
} from "../src/protocol/authenticators.js";

const SECRET = "shared-secret-for-tests";

describe("Request Authenticator (Accounting)", () => {
  it("verify accepts a freshly-signed packet", () => {
    const draft: RadiusPacket = {
      code: RadiusCode.AccountingRequest,
      identifier: 5,
      authenticator: Buffer.alloc(16),
      attributes: [
        stringAttribute(AttrType.UserName, "bob"),
        integerAttribute(AttrType.AcctStatusType, 1),
      ],
    };
    const auth = computeRequestAuthenticator(draft, SECRET);
    const signed: RadiusPacket = { ...draft, authenticator: auth };
    assert.equal(verifyRequestAuthenticator(signed, SECRET), true);
  });

  it("verify rejects a tampered packet", () => {
    const draft: RadiusPacket = {
      code: RadiusCode.AccountingRequest,
      identifier: 6,
      authenticator: Buffer.alloc(16),
      attributes: [stringAttribute(AttrType.UserName, "bob")],
    };
    const auth = computeRequestAuthenticator(draft, SECRET);
    const tampered: RadiusPacket = {
      ...draft,
      authenticator: auth,
      attributes: [stringAttribute(AttrType.UserName, "mallory")],
    };
    assert.equal(verifyRequestAuthenticator(tampered, SECRET), false);
  });

  it("verify rejects under the wrong shared secret", () => {
    const draft: RadiusPacket = {
      code: RadiusCode.AccountingRequest,
      identifier: 7,
      authenticator: Buffer.alloc(16),
      attributes: [stringAttribute(AttrType.UserName, "bob")],
    };
    const signed: RadiusPacket = { ...draft, authenticator: computeRequestAuthenticator(draft, SECRET) };
    assert.equal(verifyRequestAuthenticator(signed, "other-secret"), false);
  });
});

describe("Response Authenticator", () => {
  it("verifies against the request authenticator that triggered it", () => {
    const requestAuth = randomAuthenticator();
    const response: RadiusPacket = {
      code: RadiusCode.AccessAccept,
      identifier: 42,
      // The encoder zeros this out anyway via computeResponseAuthenticator;
      // any 16 bytes work here.
      authenticator: Buffer.alloc(16),
      attributes: [stringAttribute(AttrType.ReplyMessage, "Welcome")],
    };
    const responseAuth = computeResponseAuthenticator(response, requestAuth, SECRET);
    const wire = encode({ ...response, authenticator: responseAuth });
    assert.equal(verifyResponseAuthenticator(wire, requestAuth, SECRET), true);
  });

  it("rejects a forged response (wrong secret)", () => {
    const requestAuth = randomAuthenticator();
    const response: RadiusPacket = {
      code: RadiusCode.AccessAccept,
      identifier: 42,
      authenticator: Buffer.alloc(16),
      attributes: [],
    };
    const responseAuth = computeResponseAuthenticator(response, requestAuth, SECRET);
    const wire = encode({ ...response, authenticator: responseAuth });
    assert.equal(verifyResponseAuthenticator(wire, requestAuth, "wrong"), false);
  });
});

describe("Message-Authenticator (HMAC-MD5)", () => {
  it("round-trip verify works on a packet that includes it", () => {
    const packet: RadiusPacket = {
      code: RadiusCode.AccessRequest,
      identifier: 9,
      authenticator: randomAuthenticator(),
      attributes: [
        stringAttribute(AttrType.UserName, "alice"),
        { type: AttrType.MessageAuthenticator, value: Buffer.alloc(MESSAGE_AUTHENTICATOR_VALUE_LENGTH) },
      ],
    };

    // Compute HMAC over the packet with msg-auth value still zeroed.
    const hmac = computeMessageAuthenticator(encode(packet), SECRET);
    // Fill in the real value.
    const filled: RadiusPacket = {
      ...packet,
      attributes: packet.attributes.map((a) =>
        a.type === AttrType.MessageAuthenticator ? { type: a.type, value: hmac } : a,
      ),
    };

    // Decode back and verify.
    const decoded = decode(encode(filled));
    assert.equal(verifyMessageAuthenticator(decoded, SECRET), true);

    const onWire = findAttribute(decoded, AttrType.MessageAuthenticator);
    assert.ok(onWire);
    assert.equal(onWire.value.length, MESSAGE_AUTHENTICATOR_VALUE_LENGTH);
  });

  it("verify returns false when the attribute is absent", () => {
    const packet: RadiusPacket = {
      code: RadiusCode.AccessRequest,
      identifier: 1,
      authenticator: randomAuthenticator(),
      attributes: [stringAttribute(AttrType.UserName, "alice")],
    };
    assert.equal(verifyMessageAuthenticator(packet, SECRET), false);
  });

  it("verify rejects tampered attributes", () => {
    const packet: RadiusPacket = {
      code: RadiusCode.AccessRequest,
      identifier: 1,
      authenticator: randomAuthenticator(),
      attributes: [
        stringAttribute(AttrType.UserName, "alice"),
        { type: AttrType.MessageAuthenticator, value: Buffer.alloc(MESSAGE_AUTHENTICATOR_VALUE_LENGTH) },
      ],
    };
    const hmac = computeMessageAuthenticator(encode(packet), SECRET);
    const filled: RadiusPacket = {
      ...packet,
      attributes: [
        // username swapped after HMAC computation
        stringAttribute(AttrType.UserName, "mallory"),
        { type: AttrType.MessageAuthenticator, value: hmac },
      ],
    };
    assert.equal(verifyMessageAuthenticator(filled, SECRET), false);
  });
});

describe("encoded header sanity", () => {
  it("header[0..3] is code|id|length", () => {
    const packet: RadiusPacket = {
      code: RadiusCode.AccessRequest,
      identifier: 0x42,
      authenticator: Buffer.alloc(16),
      attributes: [],
    };
    const wire = encode(packet);
    assert.equal(wire.readUInt8(0), RadiusCode.AccessRequest);
    assert.equal(wire.readUInt8(1), 0x42);
    assert.equal(wire.readUInt16BE(2), RADIUS_HEADER_LENGTH);
  });
});
