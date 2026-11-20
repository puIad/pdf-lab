import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
};

// withWorkflow compiles the "use workflow" and "use step" directives (issue #24).
export default withWorkflow(nextConfig);
