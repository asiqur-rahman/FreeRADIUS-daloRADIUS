// ──────────────────────────────────────────────────────────────────────────────
//  MAC OUI (Organizationally Unique Identifier) lookup.
//
//  Derives the device manufacturer and classifies the device type from the
//  first 3 octets of a MAC address.  Uses a bundled static mapping — no
//  external API calls, no network dependency.
//
//  Classification is keyword-based on the manufacturer name returned by the
//  OUI database.  Best-effort: unknown MACs (locally administered, VM, etc.)
//  return null manufacturer and DeviceType.unknown.
// ──────────────────────────────────────────────────────────────────────────────

import type { DeviceType } from "@prisma/client";

// ── Bundled OUI data ──────────────────────────────────────────────────────────
// Inline the most common 300+ vendors rather than shipping a 3 MB npm package.
// MAC prefix → manufacturer name (uppercase, 6 hex chars, no colons).

const OUI_MAP: Record<string, string> = {
  // Apple
  "000A27": "Apple Inc.", "000D93": "Apple Inc.", "001124": "Apple Inc.",
  "0019E3": "Apple Inc.", "001B63": "Apple Inc.", "001CB3": "Apple Inc.",
  "001E52": "Apple Inc.", "001EC2": "Apple Inc.", "001F5B": "Apple Inc.",
  "001FF3": "Apple Inc.", "0021E9": "Apple Inc.", "002241": "Apple Inc.",
  "0023DF": "Apple Inc.", "002500": "Apple Inc.", "002608": "Apple Inc.",
  "00264B": "Apple Inc.", "003065": "Apple Inc.", "0050E4": "Apple Inc.",
  "6C4008": "Apple Inc.", "70700D": "Apple Inc.", "7C6D62": "Apple Inc.",
  "80EA96": "Apple Inc.", "88665A": "Apple Inc.", "8C2937": "Apple Inc.",
  "90B21F": "Apple Inc.", "98FE94": "Apple Inc.", "A4C361": "Apple Inc.",
  "A8BB50": "Apple Inc.", "ACBC32": "Apple Inc.", "B88D12": "Apple Inc.",
  "C82A14": "Apple Inc.", "D4619D": "Apple Inc.", "D83062": "Apple Inc.",
  "DC2B61": "Apple Inc.", "E0F5C6": "Apple Inc.", "F0D1A9": "Apple Inc.",
  "F40F24": "Apple Inc.", "F82793": "Apple Inc.",
  // Samsung
  "001599": "Samsung Electronics", "002454": "Samsung Electronics",
  "00265D": "Samsung Electronics", "0026E2": "Samsung Electronics",
  "001EE1": "Samsung Electronics", "002339": "Samsung Electronics",
  "0025A0": "Samsung Electronics", "00E091": "Samsung Electronics",
  "08D4D9": "Samsung Electronics", "0C1420": "Samsung Electronics",
  "0C2A69": "Samsung Electronics", "10D542": "Samsung Electronics",
  "1C66AA": "Samsung Electronics", "28BAB5": "Samsung Electronics",
  "38AA3C": "Samsung Electronics", "3CB87A": "Samsung Electronics",
  "40B035": "Samsung Electronics", "50A4C8": "Samsung Electronics",
  "54881B": "Samsung Electronics", "5C3C27": "Samsung Electronics",
  "60A10A": "Samsung Electronics", "64B310": "Samsung Electronics",
  "78F7BE": "Samsung Electronics", "84258C": "Samsung Electronics",
  "88329B": "Samsung Electronics", "90F1AA": "Samsung Electronics",
  "A0B4A5": "Samsung Electronics", "B4EF39": "Samsung Electronics",
  "CC07E4": "Samsung Electronics", "D022BE": "Samsung Electronics",
  // Dell
  "000874": "Dell Technologies", "00188B": "Dell Technologies",
  "001EC9": "Dell Technologies", "00215A": "Dell Technologies",
  "002128": "Dell Technologies", "00237D": "Dell Technologies",
  "0024E8": "Dell Technologies", "00265B": "Dell Technologies",
  "000BDB": "Dell Technologies", "BCEE7B": "Dell Technologies",
  "F48E38": "Dell Technologies", "14185B": "Dell Technologies",
  // Lenovo
  "000732": "Lenovo Group", "0011D8": "Lenovo Group", "001A6B": "Lenovo Group",
  "001D0F": "Lenovo Group", "001EEC": "Lenovo Group",
  "00265E": "Lenovo Group", "086266": "Lenovo Group", "10025B": "Lenovo Group",
  "14A984": "Lenovo Group", "28D244": "Lenovo Group", "34488B": "Lenovo Group",
  "484D7E": "Lenovo Group", "5CD998": "Lenovo Group", "60D9C7": "Lenovo Group",
  "70720D": "Lenovo Group", "8C8D28": "Lenovo Group", "ACB57D": "Lenovo Group",
  "C81F66": "Lenovo Group", "DC4A3E": "Lenovo Group", "E82A44": "Lenovo Group",
  // HP / Hewlett Packard
  "00110A": "HP Inc.", "001185": "HP Inc.", "0013D4": "HP Inc.",
  "001438": "HP Inc.", "00145E": "HP Inc.", "0015E0": "HP Inc.",
  "00166F": "HP Inc.", "0018FE": "HP Inc.", "001A4B": "HP Inc.",
  "001B78": "HP Inc.", "001CC4": "HP Inc.", "001D8C": "HP Inc.",
  "001E0B": "HP Inc.", "002248": "HP Inc.", "002364": "HP Inc.",
  "002219": "HP Inc.", "00237A": "HP Inc.", "002481": "HP Inc.",
  "2C27D7": "HP Inc.", "3CD92B": "HP Inc.", "888590": "HP Inc.", "9457A5": "HP Inc.",
  // Cisco
  "000142": "Cisco Systems", "000143": "Cisco Systems", "000144": "Cisco Systems",
  "000194": "Cisco Systems", "0001C7": "Cisco Systems", "0001C9": "Cisco Systems",
  "000216": "Cisco Systems", "00022D": "Cisco Systems", "000268": "Cisco Systems",
  "000304": "Cisco Systems", "00037F": "Cisco Systems", "0003E3": "Cisco Systems",
  "000401": "Cisco Systems", "00040A": "Cisco Systems", "000B5F": "Cisco Systems",
  "000C30": "Cisco Systems", "000DBD": "Cisco Systems", "000F35": "Cisco Systems",
  "001344": "Cisco Systems", "001A6D": "Cisco Systems", "001B54": "Cisco Systems",
  "001CBD": "Cisco Systems", "002155": "Cisco Systems", "0022BE": "Cisco Systems",
  "0025B4": "Cisco Systems", "00304F": "Cisco Systems", "0060CF": "Cisco Systems",
  "00E0B0": "Cisco Systems", "7081C2": "Cisco Systems", "848490": "Cisco Systems",
  // Ubiquiti
  "002722": "Ubiquiti Networks", "04187F": "Ubiquiti Networks",
  "0418D6": "Ubiquiti Networks", "24A43C": "Ubiquiti Networks",
  "44D9E7": "Ubiquiti Networks", "546428": "Ubiquiti Networks",
  "60221D": "Ubiquiti Networks", "68727B": "Ubiquiti Networks",
  "788A20": "Ubiquiti Networks", "802AA8": "Ubiquiti Networks",
  "AABB3C": "Ubiquiti Networks", "B4FBE4": "Ubiquiti Networks",
  "DC9FDB": "Ubiquiti Networks", "E0636B": "Ubiquiti Networks",
  "F09FC2": "Ubiquiti Networks", "FC3FDB": "Ubiquiti Networks",
  // MikroTik
  "000C42": "MikroTik", "2CC8E9": "MikroTik", "4C5E0C": "MikroTik",
  "6C3B6B": "MikroTik", "742F68": "MikroTik", "B8690E": "MikroTik",
  "CC2DE0": "MikroTik", "D4CA6D": "MikroTik", "E4887F": "MikroTik",
  // Aruba / HPE
  "000B86": "Aruba Networks", "001A1E": "Aruba Networks", "006764": "Aruba Networks",
  "047D7B": "Aruba Networks", "08865D": "Aruba Networks", "103755": "Aruba Networks",
  "18641D": "Aruba Networks", "1C864A": "Aruba Networks", "20A6CD": "Aruba Networks",
  "245A4C": "Aruba Networks", "285B01": "Aruba Networks", "34BDA2": "Aruba Networks",
  "3C5282": "Aruba Networks", "408B07": "Aruba Networks", "488014": "Aruba Networks",
  // TP-Link
  "001122": "TP-Link Technologies", "14CC20": "TP-Link Technologies",
  "1C61B4": "TP-Link Technologies", "2886AC": "TP-Link Technologies",
  "30B49E": "TP-Link Technologies", "50C7BF": "TP-Link Technologies",
  "5800E3": "TP-Link Technologies", "74DADA": "TP-Link Technologies",
  "787B8A": "TP-Link Technologies", "848D60": "TP-Link Technologies",
  "A42BB0": "TP-Link Technologies", "B0487A": "TP-Link Technologies",
  "C46E1F": "TP-Link Technologies", "D46E0E": "TP-Link Technologies",
  "EC086B": "TP-Link Technologies", "F4F26D": "TP-Link Technologies",
  // Espressif (IoT / ESP32 / ESP8266)
  "10527B": "Espressif Inc.", "182742": "Espressif Inc.", "244CAB": "Espressif Inc.",
  "2CF432": "Espressif Inc.", "3C6105": "Espressif Inc.", "3C71BF": "Espressif Inc.",
  "48CABC": "Espressif Inc.", "4CEBD6": "Espressif Inc.", "5CCF7F": "Espressif Inc.",
  "60019F": "Espressif Inc.", "7C9EBD": "Espressif Inc.", "80BCBE": "Espressif Inc.",
  "84CCA8": "Espressif Inc.", "8CAAB5": "Espressif Inc.", "98F4AB": "Espressif Inc.",
  "A02061": "Espressif Inc.", "AC67B2": "Espressif Inc.", "B4E62D": "Espressif Inc.",
  "BC47B5": "Espressif Inc.", "C45BBE": "Espressif Inc.", "CC50E3": "Espressif Inc.",
  "D8BFC0": "Espressif Inc.", "DC4F22": "Espressif Inc.", "E89F6D": "Espressif Inc.",
  "ECCDA0": "Espressif Inc.", "F4CFA2": "Espressif Inc.",
  // Raspberry Pi
  "2CCF67": "Raspberry Pi Foundation", "B827EB": "Raspberry Pi Foundation",
  "D83ADD": "Raspberry Pi Foundation", "DC:A6:32": "Raspberry Pi Foundation",
  "E4:5F:01": "Raspberry Pi Foundation",
  // Canon
  "0000F0": "Canon Inc.", "001533": "Canon Inc.", "001709": "Canon Inc.",
  "00173B": "Canon Inc.", "001BB3": "Canon Inc.", "001C12": "Canon Inc.",
  "080000": "Canon Inc.", "3078F0": "Canon Inc.", "806161": "Canon Inc.",
  "9028A0": "Canon Inc.", "AC220B": "Canon Inc.", "F44D30": "Canon Inc.",
  // Epson
  "00004C": "Seiko Epson", "00268E": "Seiko Epson", "0C1C57": "Seiko Epson",
  "10017B": "Seiko Epson", "68FCA0": "Seiko Epson", "90E2BA": "Seiko Epson",
  // Brother
  "001BA9": "Brother Industries", "00804A": "Brother Industries",
  "30055C": "Brother Industries", "74A782": "Brother Industries",
  "ACACAA": "Brother Industries",
  // Xerox
  "000851": "Xerox Corporation", "001ED4": "Xerox Corporation",
  "00805B": "Xerox Corporation", "0024D7": "Xerox Corporation",
  // Nintendo
  "001656": "Nintendo Co.", "0009BF": "Nintendo Co.", "001BC7": "Nintendo Co.",
  "002659": "Nintendo Co.", "002709": "Nintendo Co.", "00224C": "Nintendo Co.",
  "7CBB8A": "Nintendo Co.", "8C56C5": "Nintendo Co.", "98B6E9": "Nintendo Co.",
  "A4C0E1": "Nintendo Co.", "B8AE6E": "Nintendo Co.", "E84ECE": "Nintendo Co.",
  // Sony (PlayStation)
  "00015A": "Sony Corporation", "001315": "Sony Corporation",
  "001D0D": "Sony Corporation", "001FA7": "Sony Corporation",
  "002656": "Sony Corporation", "00ADEF": "Sony Corporation",
  "0C8112": "Sony Corporation", "28FDA1": "Sony Corporation",
  // Microsoft (Surface / Xbox)
  "001DD8": "Microsoft Corporation", "0025AE": "Microsoft Corporation",
  "002544": "Microsoft Corporation", "2C54CF": "Microsoft Corporation",
  "485B39": "Microsoft Corporation",
  "50F0D3": "Microsoft Corporation", "7C1E52": "Microsoft Corporation",
  "984F58": "Microsoft Corporation", "C478BB": "Microsoft Corporation",
  // Xiaomi
  "0016EE": "Xiaomi Communications", "28D1273": "Xiaomi Communications",
  "34CE008": "Xiaomi Communications", "58440FBE": "Xiaomi Communications",
  "64CC2E": "Xiaomi Communications", "6C5F1C": "Xiaomi Communications",
  "8CBEBED": "Xiaomi Communications", "9C99A0": "Xiaomi Communications",
  "ACF7F3": "Xiaomi Communications", "B0E235": "Xiaomi Communications",
  "CCB282": "Xiaomi Communications", "D4703B": "Xiaomi Communications",
  "F0B429": "Xiaomi Communications", "F48B32": "Xiaomi Communications",
  // Google / Nest
  "003E73": "Google LLC", "1C77F6": "Google LLC", "3C5AB4": "Google LLC",
  "48BAED": "Google LLC", "4C6024": "Google LLC", "5490A8": "Google LLC",
  "6080BB": "Google LLC", "6C2165": "Google LLC", "8897BA": "Google LLC",
  "A47733": "Google LLC", "B45403": "Google LLC", "C4652B": "Google LLC",
  "D4F57D": "Google LLC", "F4F5E8": "Google LLC",
  // Amazon (Echo, Kindle, Fire TV)
  "0C47C9": "Amazon Technologies", "10AE60": "Amazon Technologies",
  "18742E": "Amazon Technologies", "1C4D70": "Amazon Technologies",
  "28EF01": "Amazon Technologies", "348037": "Amazon Technologies",
  "44650D": "Amazon Technologies", "4CBBF3": "Amazon Technologies",
  "68039C": "Amazon Technologies", "74C246": "Amazon Technologies",
  "78E103": "Amazon Technologies", "A002DC": "Amazon Technologies",
  "AC63BE": "Amazon Technologies", "B47C9C": "Amazon Technologies",
  "F0272D": "Amazon Technologies", "F8041C": "Amazon Technologies",
  // Asus
  "001731": "ASUSTek Computer", "001E8C": "ASUSTek Computer",
  "001F16": "ASUSTek Computer", "002618": "ASUSTek Computer",
  "00265F": "ASUSTek Computer", "10FEED": "ASUSTek Computer",
  "2C56DC": "ASUSTek Computer", "382C4A": "ASUSTek Computer",
  "40167E": "ASUSTek Computer", "4CE676": "ASUSTek Computer",
  "5404A6": "ASUSTek Computer", "60A44C": "ASUSTek Computer",
  "74D02B": "ASUSTek Computer", "90E6BA": "ASUSTek Computer",
  "AC9E17": "ASUSTek Computer", "BC5FF4": "ASUSTek Computer",
  "D850E6": "ASUSTek Computer", "F07960": "ASUSTek Computer",
};

// ── Lookup ────────────────────────────────────────────────────────────────────

/**
 * Look up the manufacturer name for a MAC address.
 * Returns null for locally-administered MACs, multicast, or unknown OUIs.
 */
export function lookupManufacturer(mac: string): string | null {
  // Normalise to upper hex, no separators
  const normalised = mac.toUpperCase().replace(/[:\-\.]/g, "");
  if (normalised.length < 6) return null;

  // Locally administered bit (bit 1 of first octet) → vendor unknown
  const firstOctet = parseInt(normalised.slice(0, 2), 16);
  if (isNaN(firstOctet) || (firstOctet & 0x02) !== 0) return null;

  const oui = normalised.slice(0, 6);
  return OUI_MAP[oui] ?? null;
}

/**
 * Classify a device type from the manufacturer name.
 * Returns DeviceType.unknown when the manufacturer is null or unrecognised.
 */
export function classifyDeviceType(manufacturer: string | null): DeviceType {
  if (!manufacturer) return "unknown";
  const m = manufacturer.toLowerCase();

  if (m.includes("espressif") || m.includes("raspberry pi") || m.includes("tuya") ||
      m.includes("shenzhen") || m.includes("realtek semi") || m.includes("nordic semi")) {
    return "iot";
  }
  if (m.includes("cisco") || m.includes("ubiquiti") || m.includes("mikrotik") ||
      m.includes("aruba") || m.includes("tp-link") || m.includes("juniper") ||
      m.includes("netgear") || m.includes("zyxel") || m.includes("fortinet")) {
    return "network";
  }
  if (m.includes("canon") || m.includes("epson") || m.includes("brother") ||
      m.includes("xerox") || m.includes("hp inc") || m.includes("lexmark") ||
      m.includes("ricoh") || m.includes("kyocera") || m.includes("konica")) {
    return "printer";
  }
  if (m.includes("nintendo")) return "gaming";
  if (m.includes("sony") && !m.includes("vaio")) return "gaming";
  if (m.includes("microsoft") && !m.includes("surface")) return "gaming"; // Xbox
  if (m.includes("samsung") && m.includes("display")) return "tv";
  if (m.includes("lg electronics") || m.includes("tcl") || m.includes("vizio") ||
      m.includes("roku") || m.includes("hisense") || m.includes("sharp") ||
      m.includes("panasonic") || m.includes("philips")) {
    return "tv";
  }
  if (m.includes("apple")) return "mobile";   // conservative: could be Mac too
  if (m.includes("samsung electronics") || m.includes("xiaomi") ||
      m.includes("huawei") || m.includes("oppo") || m.includes("oneplus") ||
      m.includes("vivo") || m.includes("realme") || m.includes("motorola") ||
      m.includes("google") || m.includes("amazon")) {
    return "mobile";
  }
  if (m.includes("dell") || m.includes("lenovo") || m.includes("acer") ||
      m.includes("asus") || m.includes("toshiba") || m.includes("intel corp") ||
      m.includes("microsoft") || m.includes("surface") || m.includes("vaio")) {
    return "laptop";
  }
  return "unknown";
}
