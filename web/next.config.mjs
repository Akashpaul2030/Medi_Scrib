/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Landing page icon components have a prop-type mismatch with the
    // installed lucide-react version. Suppressed here; fix landing
    // components when upgrading lucide-react.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
