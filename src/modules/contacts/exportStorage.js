const fs = require("fs");
const path = require("path");
const { GetObjectCommand, PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const config = require("../../config");

let client = null;

function getS3Client() {
  if (!client) client = new S3Client({ region: config.aws.region });
  return client;
}

function cleanPrefix(prefix) {
  return String(prefix || "").replace(/^\/+|\/+$/g, "");
}

function s3ExportBucket() {
  return config.aws.s3.contactExportsBucket || "";
}

function s3ExportKey({ locationId, jobId, fileName }) {
  const safeFileName = String(fileName || "customers.csv").replace(/[^a-z0-9._-]+/gi, "-").slice(0, 120);
  return `${cleanPrefix(config.aws.s3.contactExportsPrefix || "contact-exports")}/${locationId}/${jobId}/${safeFileName}`;
}

async function uploadContactExport({ locationId, jobId, fileName, filePath }) {
  const bucket = s3ExportBucket();
  if (!bucket) {
    return {
      storageType: "local",
      storageBucket: null,
      storageKey: null,
      filePath,
    };
  }

  const key = s3ExportKey({ locationId, jobId, fileName });
  await getS3Client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fs.createReadStream(filePath),
    ContentType: "text/csv; charset=utf-8",
    ContentDisposition: `attachment; filename="${path.basename(fileName || "customers.csv").replace(/"/g, "")}"`,
    ServerSideEncryption: "AES256",
  }));

  return {
    storageType: "s3",
    storageBucket: bucket,
    storageKey: key,
    filePath: null,
  };
}

async function openContactExport({ storageType, storageBucket, storageKey, filePath }) {
  if (storageType === "s3") {
    if (!storageBucket || !storageKey) {
      const err = new Error("Export storage object is missing.");
      err.statusCode = 404;
      throw err;
    }
    const response = await getS3Client().send(new GetObjectCommand({
      Bucket: storageBucket,
      Key: storageKey,
    }));
    return { stream: response.Body, contentLength: response.ContentLength || null };
  }

  return {
    stream: fs.createReadStream(filePath),
    contentLength: fs.statSync(filePath).size,
  };
}

module.exports = {
  openContactExport,
  uploadContactExport,
};
