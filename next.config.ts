import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { '/api/2048/*': ['./public/2048/*.js'] },
  images: {
    remotePatterns: [{
      protocol: "https",
      hostname: "wmndxiuqzrnqbhrznmfg.supabase.co",
      pathname: "/storage/v1/object/sign/question-factory-assets/**",
    }],
  },
};

export default nextConfig;
