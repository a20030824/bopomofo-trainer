import { parseReading } from "../src/scheme/parse-reading.js";

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk as Buffer);
}
const readings = JSON.parse(Buffer.concat(chunks).toString("utf8")) as readonly string[];
const results = readings.map((reading) => {
  const parsed = parseReading(reading);
  return parsed.ok ? { ok: true as const } : { ok: false as const, reason: parsed.errors[0]?.message ?? "invalid reading" };
});
process.stdout.write(JSON.stringify(results));
