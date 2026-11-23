/** @type {import('next').NextConfig} */
module.exports = {
  allowedDevOrigins: process.env.DEMO_HOST_IP ? [process.env.DEMO_HOST_IP] : [],
  // The E2E script runs beside the demo server, and Next allows one dev server per build folder.
  ...(process.env.RADO_E2E_DIR ? { distDir: ".next-e2e" } : {}),
};
