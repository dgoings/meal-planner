"use node";

import { lookup } from "node:dns/promises";
import { BlockList } from "node:net";

const privateAddresses = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
] as const) {
  privateAddresses.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 127],
  ["64:ff9b::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  privateAddresses.addSubnet(network, prefix, "ipv6");
}

export function isPublicAddress(address: string, family: number) {
  if (family === 4) return !privateAddresses.check(address, "ipv4");
  const mappedIpv4 = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4 !== undefined) return !privateAddresses.check(mappedIpv4, "ipv4");
  return !privateAddresses.check(address, "ipv6");
}

// A public-looking name can still resolve to a loopback, private-network, or
// cloud-metadata address, so the hostname check alone is not enough.
export async function assertPublicResolution(hostname: string) {
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new Error(`Could not resolve ${hostname}`);
  }
  if (
    addresses.length === 0 ||
    addresses.some(({ address, family }) => !isPublicAddress(address, family))
  ) {
    throw new Error("Host does not resolve to a public address");
  }
}
