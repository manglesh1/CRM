const crypto = require("crypto");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const config = require("../../../config");

const MAX_BYTES = 10 * 1024 * 1024;
const MIME_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

let client = null;

function getS3Client() {
  if (!client) client = new S3Client({ region: config.aws.region });
  return client;
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!match) return null;
  return {
    mimeType: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], "base64"),
  };
}

function dimensions(buffer, mimeType) {
  if (mimeType === "image/png" && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mimeType === "image/gif" && buffer.length >= 10) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (mimeType === "image/webp" && buffer.length >= 30) {
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8X" && buffer.length >= 30) {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      };
    }
  }
  if (mimeType === "image/jpeg") {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const len = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3 && offset + 8 < buffer.length) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + len;
    }
  }
  return { width: null, height: null };
}

function publicUrlForKey(key) {
  if (config.aws.s3.publicBaseUrl) {
    return `${config.aws.s3.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }
  return `https://${config.aws.s3.marketingAssetsBucket}.s3.${config.aws.region}.amazonaws.com/${key}`;
}

async function uploadMarketingAsset({ locationId, fileName, dataUrl }) {
  const bucket = config.aws.s3.marketingAssetsBucket;
  if (!bucket) {
    const err = new Error("S3_MARKETING_ASSETS_BUCKET is not configured.");
    err.statusCode = 500;
    throw err;
  }
  const parsed = parseDataUrl(dataUrl);
  if (!parsed || !MIME_EXT[parsed.mimeType]) {
    const err = new Error("Only jpg, png, webp, and gif image uploads are supported.");
    err.statusCode = 400;
    throw err;
  }
  if (parsed.buffer.length > MAX_BYTES) {
    const err = new Error("Image must be 10 MB or smaller.");
    err.statusCode = 400;
    throw err;
  }
  const ext = MIME_EXT[parsed.mimeType];
  const cleanName = String(fileName || "asset").replace(/[^a-z0-9._-]+/gi, "-").slice(0, 80);
  const hash = crypto.randomBytes(8).toString("hex");
  const key = `${config.aws.s3.marketingAssetsPrefix.replace(/^\/|\/$/g, "")}/${locationId}/${Date.now()}-${hash}-${cleanName}.${ext}`;
  await getS3Client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: parsed.buffer,
    ContentType: parsed.mimeType,
    CacheControl: "public, max-age=31536000, immutable",
  }));
  const size = dimensions(parsed.buffer, parsed.mimeType);
  return {
    key,
    url: publicUrlForKey(key),
    mimeType: parsed.mimeType,
    sizeBytes: parsed.buffer.length,
    width: size.width,
    height: size.height,
  };
}

module.exports = { uploadMarketingAsset };
