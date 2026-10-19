import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
const media = JSON.parse(await readFile(new URL("../src/mocks/media.json", import.meta.url), "utf8"));
const manifest = JSON.parse(await readFile(new URL("../../../fixtures/catalog/manifest.json", import.meta.url), "utf8"));
assert.equal(media.length, manifest.products.length);
assert.equal(new Set(media.map(m => m.product_id)).size, manifest.products.length);
assert.equal(new Set(media.map(m => m.url)).size, manifest.products.length);
for (const record of media) {
  const product = manifest.products.find(p => p.id === record.product_id);
  assert.ok(product); assert.equal(product.slug, record.slug); assert.equal(product.image.id, record.image_id);
  assert.ok(record.url.startsWith("/media/catalog/") && record.url.endsWith(".jpg"));
  const file = await readFile(new URL(`../public${record.url}`, import.meta.url));
  assert.equal(file[0], 0xff); assert.equal(file[1], 0xd8);
  assert.equal(createHash("sha256").update(file).digest("hex"), record.sha256);
  assert.equal(record.license, "https://www.pexels.com/license/");
}
for (const name of ["Inter", "PlayfairDisplay"]) {
  assert.ok((await readFile(new URL(`../src/fonts/${name}.ttf`, import.meta.url))).length > 10000);
  assert.match(await readFile(new URL(`../src/fonts/${name}-OFL.txt`, import.meta.url), "utf8"), /SIL OPEN FONT LICENSE/);
}
console.log(`Verified ${media.length} unique local JPEGs, canonical product/image IDs, source licenses and SHA256 checksums; two bundled OFL fonts.`);
