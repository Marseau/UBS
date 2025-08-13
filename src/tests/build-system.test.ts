/**
 * BUILD SYSTEM VALIDATION TESTS
 * Tests for webpack build process and optimization
 */

import * as fs from "fs";
import * as path from "path";

export class BuildSystemTests {
  async runAllTests(): Promise<boolean> {
    console.log("🔨 Build System Validation Tests");

    try {
      await this.testBuildArtifacts();
      await this.testSizeOptimization();
      await this.testMinification();

      console.log("✅ All build system tests passed");
      return true;
    } catch (error) {
      console.error("❌ Build system tests failed:", error);
      return false;
    }
  }

  private async testBuildArtifacts(): Promise<void> {
    console.log("  Testing build artifacts...");

    const distPath = path.join(process.cwd(), "src/frontend/dist/js");
    if (!fs.existsSync(distPath)) {
      throw new Error("Frontend dist directory does not exist");
    }

    const files = fs.readdirSync(distPath);
    const jsFiles = files.filter((f) => f.endsWith(".js"));

    if (jsFiles.length === 0) {
      throw new Error("No JavaScript files found in dist");
    }

    console.log(`  ✅ Found ${jsFiles.length} build artifacts`);
  }

  private async testSizeOptimization(): Promise<void> {
    console.log("  Testing size optimization...");

    const distPath = path.join(process.cwd(), "src/frontend/dist/js");
    const files = fs.readdirSync(distPath).filter((f) => f.endsWith(".js"));

    let totalSize = 0;
    for (const file of files) {
      const stats = fs.statSync(path.join(distPath, file));
      totalSize += stats.size;
    }

    const totalKB = Math.round(totalSize / 1024);
    const targetKB = 250; // Target under 250KB

    if (totalKB > targetKB) {
      throw new Error(`Build size ${totalKB}KB exceeds target ${targetKB}KB`);
    }

    console.log(
      `  ✅ Build size optimized: ${totalKB}KB (target: ${targetKB}KB)`,
    );
  }

  private async testMinification(): Promise<void> {
    console.log("  Testing minification...");

    const distPath = path.join(process.cwd(), "src/frontend/dist/js");
    const files = fs.readdirSync(distPath).filter((f) => f.endsWith(".min.js"));

    if (files.length === 0) {
      throw new Error("No minified files found");
    }

    // Test that files are actually minified (no excessive whitespace)
    for (const file of files) {
      const content = fs.readFileSync(path.join(distPath, file), "utf8");
      const lines = content.split("\\n");
      const avgLineLength = content.length / lines.length;

      if (avgLineLength < 50) {
        throw new Error(`File ${file} doesn't appear to be properly minified`);
      }
    }

    console.log(`  ✅ ${files.length} files properly minified`);
  }
}
