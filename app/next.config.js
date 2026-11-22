/** @type {import('next').NextConfig} */
module.exports = {
  allowedDevOrigins: process.env.DEMO_HOST_IP ? [process.env.DEMO_HOST_IP] : [],
};
