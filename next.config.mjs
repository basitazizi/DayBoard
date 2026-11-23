/** @type {import('next').NextConfig} */
const nextConfig = {
  // Let the dev server be opened from any private-network IP (phone, VPN,
  // WSL/Hyper-V adapters) — these addresses change, so allow the ranges.
  allowedDevOrigins: ["10.*.*.*", "172.*.*.*", "192.168.*.*"],
};

export default nextConfig;
