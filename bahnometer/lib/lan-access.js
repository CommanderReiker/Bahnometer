import { BlockList, isIP } from 'node:net';

const localNetworks = new BlockList();
for (const [address, prefix] of [['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['127.0.0.0', 8], ['169.254.0.0', 16]]) {
  localNetworks.addSubnet(address, prefix, 'ipv4');
}
localNetworks.addAddress('::1', 'ipv6');
localNetworks.addSubnet('fc00::', 7, 'ipv6');
localNetworks.addSubnet('fe80::', 10, 'ipv6');

// Only use req.socket.remoteAddress. Forwarding headers cannot grant access.
export function isLanAddress(address) {
  const version = isIP(address ?? '');
  return version !== 0 && localNetworks.check(address, version === 4 ? 'ipv4' : 'ipv6');
}
