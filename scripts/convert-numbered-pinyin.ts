import { numberedPinyinToTrainerReading } from "../src/readings/pinyin-to-bopomofo.js";

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk as Buffer);
}
const values = JSON.parse(Buffer.concat(chunks).toString("utf8")) as readonly string[];
const converted = values.map((value) => numberedPinyinToTrainerReading(value));
process.stdout.write(JSON.stringify(converted));
