/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@ffmpeg-installer/ffmpeg', 'fluent-ffmpeg', 'youtube-dl-exec', '@ffprobe-installer/ffprobe']
};

export default nextConfig;
