import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{
      protocol: "https",
      hostname: "wmndxiuqzrnqbhrznmfg.supabase.co",
      pathname: "/storage/v1/object/sign/question-factory-assets/**",
    }],
  },
};

export default nextConfig;
