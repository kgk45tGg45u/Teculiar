const fs = require("node:fs");
const path = require("node:path");

class MarkdownReporter {
  constructor(options = {}) {
    this.outputFile = options.outputFile || "tests/e2e/results/latest-report.md";
    this.rows = [];
    this.startedAt = Date.now();
  }

  onBegin() {
    this.startedAt = Date.now();
  }

  onTestEnd(test, result) {
    this.rows.push({
      attachments: result.attachments || [],
      duration: result.duration,
      errors: result.errors || (result.error ? [result.error] : []),
      status: result.status,
      title: test.titlePath().slice(1).join(" >")
    });
  }

  onEnd(result) {
    const outputPath = path.resolve(process.cwd(), this.outputFile);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, this.render(result), "utf8");
  }

  render(result) {
    const finishedAt = new Date();
    const totalDuration = Date.now() - this.startedAt;
    const failed = this.rows.filter((row) => !["passed", "skipped"].includes(row.status));
    const lines = [
      "# Playwright E2E Report",
      "",
      `Generated: ${finishedAt.toISOString()}`,
      `Status: ${result.status}`,
      `Duration: ${totalDuration} ms`,
      "",
      "## Summary",
      "",
      "| Status | Count |",
      "| --- | ---: |",
      ...["passed", "failed", "timedOut", "skipped", "interrupted"].map((status) => `| ${status} | ${this.rows.filter((row) => row.status === status).length} |`),
      "",
      "## Tests",
      "",
      "| Test | Status | Duration |",
      "| --- | --- | ---: |",
      ...this.rows.map((row) => `| ${escapeCell(row.title)} | ${row.status} | ${row.duration} ms |`)
    ];

    if (failed.length === 0) {
      lines.push("", "## Failures", "", "None.");
      return `${lines.join("\n")}\n`;
    }

    lines.push("", "## Failures", "");
    for (const row of failed) {
      lines.push(`### ${row.title}`, "", `Status: ${row.status}`, `Duration: ${row.duration} ms`, "");
      if (row.errors.length > 0) {
        lines.push("Errors:", "");
        for (const error of row.errors) {
          lines.push("```text", String(error.stack || error.message || error.value || error).trim(), "```", "");
        }
      }

      const attachments = row.attachments.filter((attachment) => attachment.path);
      const screenshot = attachments.filter((attachment) => /screenshot|image\/png/i.test(`${attachment.name} ${attachment.contentType}`));
      const video = attachments.filter((attachment) => /video/i.test(`${attachment.name} ${attachment.contentType}`));
      const trace = attachments.filter((attachment) => /trace/i.test(`${attachment.name} ${attachment.contentType}`));
      const timing = row.attachments.filter((attachment) => /step-timings/i.test(attachment.name));

      lines.push("Failure assets:", "");
      lines.push(`- screenshots: ${assetList(screenshot)}`);
      lines.push(`- videos: ${assetList(video)}`);
      lines.push(`- traces: ${assetList(trace)}`);
      lines.push(`- timing: ${assetList(timing)}`);
      lines.push("");
    }

    return `${lines.join("\n")}\n`;
  }
}

function assetList(attachments) {
  if (!attachments.length) {
    return "none captured";
  }
  return attachments.map((attachment) => attachment.path ? path.relative(process.cwd(), attachment.path) : attachment.name).join(", ");
}

function escapeCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

module.exports = MarkdownReporter;
