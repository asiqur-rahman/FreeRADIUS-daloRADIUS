// ─────────────────────────────────────────────────────────────────────
//  UDP listeners (auth on 1812, accounting on 1813) + per-packet
//  pipeline.
//
//  Pipeline per datagram:
//    1. Resolve source IP → NAS row (silent drop if unknown).
//    2. Decode (silent drop on parse error per RFC 2865 §3).
//    3. Verify integrity (Message-Authenticator for EAP / CoA /
//       Disconnect; Request Authenticator for Accounting / CoA /
//       Disconnect).
//    4. Dispatch on code:
//         AccessRequest      → auth/dispatch.ts (PAP/MSCHAPv2/CHAP)
//         AccountingRequest  → accounting/dispatch.ts
//         (others)           → silent drop until A4/A5
//    5. Build response, sign with the Response Authenticator, send.
//
//  Why two sockets rather than one? RFC convention, every NAS expects
//  it, and the routing logic stays simple — auth never reads acct
//  attributes and vice versa.
//
//  Why silent drop on bad packets? RFC 2865 §3 — replying to malformed
//  or unauthenticated packets leaks information and amplifies DoS.
// ─────────────────────────────────────────────────────────────────────

import { createSocket, type RemoteInfo, type Socket } from "node:dgram";

import { AttrType, MESSAGE_AUTHENTICATOR_VALUE_LENGTH } from "./protocol/attributes.js";
import {
  decode,
  encode,
  RadiusDecodeError,
  type RadiusPacket,
} from "./protocol/codec.js";
import { handleAccessRequest } from "./auth/dispatch.js";
import { type AuthBackend, prismaAuthBackend } from "./auth/common.js";
import { handleAccountingRequest } from "./accounting/dispatch.js";
import { type AcctBackend, prismaAcctBackend } from "./accounting/persistence.js";
import { handleCoaRequest, handleDisconnectRequest } from "./coa/inbound.js";
import {
  RadiusCode,
  isContentAuthenticatedRequest,
  radiusCodeName,
} from "./protocol/codes.js";
import {
  computeResponseAuthenticator,
  fillResponseMessageAuthenticator,
  verifyMessageAuthenticator,
  verifyRequestAuthenticator,
} from "./protocol/authenticators.js";

import { config } from "./config.js";
import { log } from "./log.js";
import { lookupNasByIp as defaultLookupNasByIp, type NasIdentity } from "./nas.js";

export interface RadiusServer {
  listen(): Promise<void>;
  close(): Promise<void>;
}

export type NasLookup = (sourceIp: string) => Promise<NasIdentity | null>;

export interface ServerDeps {
  /** Override for tests. Defaults to the production Postgres-backed lookup. */
  lookupNas?: NasLookup;
  /** Override for tests. Defaults to the Prisma-backed auth backend. */
  authBackend?: AuthBackend;
  /** Override for tests. Defaults to the Prisma-backed accounting backend. */
  acctBackend?: AcctBackend;
}

type Role = "auth" | "acct" | "coa";

export function createRadiusServer(deps: ServerDeps = {}): RadiusServer {
  const c = config();
  const lookupNas = deps.lookupNas ?? defaultLookupNasByIp;
  const authBackend = deps.authBackend ?? prismaAuthBackend;
  const acctBackend = deps.acctBackend ?? prismaAcctBackend;

  const authSocket = makeSocket("auth");
  const acctSocket = makeSocket("acct");
  const coaSocket = makeSocket("coa");

  function makeSocket(role: Role): Socket {
    const sock = createSocket({ type: "udp4", reuseAddr: false });
    sock.on("message", (buf, rinfo) => {
      handlePacket(buf, rinfo, sock, role, lookupNas, authBackend, acctBackend).catch((err) => {
        log.error(
          { err, role, peer: `${rinfo.address}:${rinfo.port}` },
          "radius.handler_unhandled",
        );
      });
    });
    sock.on("error", (err) => log.error({ err, role }, "radius.socket_error"));
    return sock;
  }

  function bind(sock: Socket, port: number, role: Role): Promise<void> {
    return new Promise((resolve, reject) => {
      sock.once("error", reject);
      sock.bind(port, c.RADIUS_HOST, () => {
        sock.off("error", reject);
        log.info({ host: c.RADIUS_HOST, port, role }, "radius.listening");
        resolve();
      });
    });
  }

  return {
    listen: async () => {
      await bind(authSocket, c.RADIUS_AUTH_PORT, "auth");
      await bind(acctSocket, c.RADIUS_ACCT_PORT, "acct");
      await bind(coaSocket, c.RADIUS_COA_PORT, "coa");
    },
    close: () =>
      Promise.all([
        new Promise<void>((resolve) => authSocket.close(() => resolve())),
        new Promise<void>((resolve) => acctSocket.close(() => resolve())),
        new Promise<void>((resolve) => coaSocket.close(() => resolve())),
      ]).then(() => undefined),
  };
}

// ── Per-packet logic ───────────────────────────────────────────────

async function handlePacket(
  buf: Buffer,
  rinfo: RemoteInfo,
  socket: Socket,
  role: Role,
  lookupNas: NasLookup,
  authBackend: AuthBackend,
  acctBackend: AcctBackend,
): Promise<void> {
  const peer = `${rinfo.address}:${rinfo.port}`;

  // Step 1 — resolve NAS by source IP.
  const nas = await lookupNas(rinfo.address);
  if (!nas) {
    log.warn({ peer, role, bytes: buf.length }, "radius.unknown_nas_dropped");
    return;
  }

  // Step 2 — decode. Failures are silent.
  let packet: RadiusPacket;
  try {
    packet = decode(buf);
  } catch (err) {
    if (err instanceof RadiusDecodeError) {
      log.warn({ peer, role, nas: nas.shortname, err: err.message }, "radius.decode_failed");
      return;
    }
    throw err;
  }

  const codeName = radiusCodeName(packet.code);
  const ctx = { peer, role, nas: nas.shortname, id: packet.identifier, code: codeName };
  log.debug(ctx, "radius.packet_received");

  // Step 2.5 — refuse packets received on the wrong socket. Some NASes
  // misconfigure ports; we'd rather log + drop than process accounting on
  // the auth socket (or vice-versa).
  if (!validForRole(packet.code, role)) {
    log.warn(ctx, "radius.code_role_mismatch");
    return;
  }

  // Step 3 — integrity checks.
  if (!checkIntegrity(packet, nas, peer)) return;

  // Step 4 — dispatch.
  const response = await dispatch(packet, nas, rinfo.address, authBackend, acctBackend);
  if (!response) {
    log.debug({ code: packet.code, role }, "radius.dispatch_no_reply");
    return;
  }

  // Step 5 — sign + send. Order matters:
  //   1. If the response contains a Message-Authenticator placeholder
  //      (always present on EAP responses), fill it first — the HMAC
  //      input uses the request's Authenticator field.
  //   2. Compute the Response Authenticator over the now-filled packet.
  //   The encoder zeros the header Authenticator before hashing both.
  fillResponseMessageAuthenticator(response, packet.authenticator, nas.secret);
  const signed: RadiusPacket = {
    ...response,
    authenticator: computeResponseAuthenticator(response, packet.authenticator, nas.secret),
  };
  const wire = encode(signed);
  socket.send(wire, rinfo.port, rinfo.address, (err) => {
    if (err) log.error({ err, peer, role }, "radius.send_failed");
    else log.info({ ...ctx, replied: radiusCodeName(signed.code) }, "radius.reply_sent");
  });
}

function validForRole(code: number, role: Role): boolean {
  if (role === "auth") return code === RadiusCode.AccessRequest;
  if (role === "acct") return code === RadiusCode.AccountingRequest;
  // role === "coa"
  return code === RadiusCode.CoaRequest || code === RadiusCode.DisconnectRequest;
}

function checkIntegrity(packet: RadiusPacket, nas: NasIdentity, peer: string): boolean {
  // Request Authenticator (only meaningful for content-derived codes).
  if (isContentAuthenticatedRequest(packet.code)) {
    if (!verifyRequestAuthenticator(packet, nas.secret)) {
      log.warn(
        { peer, nas: nas.shortname, code: radiusCodeName(packet.code) },
        "radius.bad_request_authenticator",
      );
      return false;
    }
  }

  // Message-Authenticator: REQUIRED for EAP messages (RFC 3579), REQUIRED
  // for CoA/Disconnect (RFC 5176), RECOMMENDED for everything else
  // (RFC 5080). The platform defaults REQUIRE_MESSAGE_AUTHENTICATOR=true
  // because Phase A2+ is EAP-first.
  const hasMsgAuth = packet.attributes.some(
    (a) => a.type === AttrType.MessageAuthenticator && a.value.length === MESSAGE_AUTHENTICATOR_VALUE_LENGTH,
  );
  if (hasMsgAuth) {
    if (!verifyMessageAuthenticator(packet, nas.secret)) {
      log.warn(
        { peer, nas: nas.shortname, code: radiusCodeName(packet.code) },
        "radius.bad_message_authenticator",
      );
      return false;
    }
  } else if (config().REQUIRE_MESSAGE_AUTHENTICATOR && packet.code === RadiusCode.AccessRequest) {
    log.warn(
      { peer, nas: nas.shortname },
      "radius.missing_message_authenticator",
    );
    return false;
  } else if (
    packet.code === RadiusCode.CoaRequest ||
    packet.code === RadiusCode.DisconnectRequest
  ) {
    log.warn(
      { peer, nas: nas.shortname, code: radiusCodeName(packet.code) },
      "radius.missing_message_authenticator",
    );
    return false;
  }

  return true;
}

// ── Dispatcher ─────────────────────────────────────────────────────

async function dispatch(
  packet: RadiusPacket,
  nas: NasIdentity,
  peerAddress: string,
  authBackend: AuthBackend,
  acctBackend: AcctBackend,
): Promise<RadiusPacket | null> {
  switch (packet.code) {
    case RadiusCode.AccessRequest: {
      const response = await handleAccessRequest(packet, { nas, backend: authBackend });
      return { ...response, identifier: packet.identifier };
    }

    case RadiusCode.AccountingRequest: {
      const response = await handleAccountingRequest(packet, {
        nas,
        peerAddress,
        backend: acctBackend,
      });
      return { ...response, identifier: packet.identifier };
    }

    case RadiusCode.DisconnectRequest:
      return handleDisconnectRequest(packet);

    case RadiusCode.CoaRequest:
      return handleCoaRequest(packet);

    default:
      // Unknown / unsupported code → silent drop.
      log.debug({ code: packet.code }, "radius.dispatch_unsupported");
      return null;
  }
}
