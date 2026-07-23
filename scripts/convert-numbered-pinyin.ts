import { numberedPinyinToTrainerReading, PinyinConversionError } from "../src/readings/pinyin-to-bopomofo.js";

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk as Buffer);
}
const values = JSON.parse(Buffer.concat(chunks).toString("utf8")) as readonly string[];
const converted = values.map((value) => {
  try {
    return { ok: true as const, reading: numberedPinyinToTrainerReading(value) };
  } catch (error) {
    if (error instanceof PinyinConversionError) {
      return { ok: false as const, reason: error.message };
    }
    throw error;
  }
});
process.stdout.write(JSON.stringify(converted));
