// CRM Marketing → Email service.
//
// Concerns:
//   - Folders (campaign + template hierarchies).
//   - Templates (design / code / plain editors).
//   - Campaigns (draft → scheduled → sent + denormalised aggregates).
//   - Statistics (engagement, performance, top-performers).

const { Op } = require("sequelize");
const config = require("../../../config");
const { getModels } = require("../../../db/models");
const { createDefaultDesign } = require("./builder/defaultDesign");
const { renderDesign } = require("./builder/renderer");
const { getBuilderCatalog } = require("./builder/catalog");
const { getMergeTagCatalog } = require("./builder/mergeTags");
const { validateDesign } = require("./builder/schema");
const emailProvider = require("../../messaging-core/providers/emailProviderRouter");
const { enqueueMarketingMessage } = require("../../messaging-core/aws/sqsClient");
const { uploadMarketingAsset } = require("./assetUpload");
const marketingMessageRepository = require("./messageRepository");
const suppressionService = require("./suppressionService");

// ── Helpers ─────────────────────────────────────────────────────────

function requireLocation(locationId) {
  if (!locationId) {
    const err = new Error("locationId is required");
    err.statusCode = 400;
    throw err;
  }
  return Number(locationId);
}

function notFound(label) {
  const err = new Error(`${label} not found`);
  err.statusCode = 404;
  return err;
}

function validate(rules) {
  const errors = rules.filter(Boolean);
  if (errors.length) {
    const err = new Error(errors[0].message || "Validation failed");
    err.statusCode = 400;
    err.errors = errors;
    throw err;
  }
}

const VALID_EDITOR_TYPES = ["design", "code", "plain"];
const VALID_TEMPLATE_USE_CASES = ["marketing"];
const VALID_FOLDER_KINDS = ["campaign", "template"];
const VALID_CAMPAIGN_STATUSES = ["draft", "scheduled", "sending", "sent", "paused", "failed", "cancelled"];
const VALID_ASSET_TYPES = ["image", "logo", "background", "social", "other"];
const VALID_SNIPPET_TYPES = ["section", "block"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getTemplateBuilderCatalog() {
  return getBuilderCatalog();
}

function normalizeRecipients(input) {
  const list = Array.isArray(input) ? input : [];
  return list
    .map((item) => {
      if (typeof item === "string") return { email: item.trim(), data: {} };
      if (!item || typeof item !== "object") return null;
      return {
        email: String(item.email || item.recipient || "").trim(),
        data: item.data && typeof item.data === "object" ? item.data : {},
        subject: item.subject ? String(item.subject) : undefined,
      };
    })
    .filter((item) => item && EMAIL_RE.test(item.email));
}

function recipientEmail(item) {
  if (typeof item === "string") return item.trim();
  if (!item || typeof item !== "object") return "";
  return String(item.email || item.recipient || "").trim();
}

function collectDesignBlocks(designJson) {
  return (designJson?.sections || []).flatMap((section) =>
    (section.columns || []).flatMap((column) => column.blocks || [])
  );
}

function templateText(template) {
  if (!template) return "";
  if (template.editorType === "design") {
    return collectDesignBlocks(template.designJson || {})
      .map((block) => [block.type, block.content, JSON.stringify(block.settings || {})].filter(Boolean).join(" "))
      .join(" ");
  }
  return [template.htmlBody, template.plainText].filter(Boolean).join(" ");
}

function analyzeTemplateCompliance(template) {
  const text = templateText(template);
  const blocks = template?.editorType === "design" ? collectDesignBlocks(template.designJson || {}) : [];
  const hasFooterBlock = blocks.some((block) => block.type === "footer");
  const usesRuntimeUnsubscribe = /\{\{\s*unsubscribeUrl\s*\}\}/i.test(text);
  const hasStaticUnsubscribe = /href=["'][^"']*(unsubscribe|subscription|preferences)[^"']*["']/i.test(text);
  const hasUnsubscribeTextLink = /unsubscribe/i.test(text) && /href=/i.test(text);
  const hasUnsubscribeLink = usesRuntimeUnsubscribe || hasStaticUnsubscribe || hasUnsubscribeTextLink;
  const hasRuntimeUrlBase = Boolean(config.urls.trackingBaseUrl || config.urls.publicBaseUrl);
  return {
    hasFooterBlock,
    hasUnsubscribeLink,
    usesRuntimeUnsubscribe,
    hasRuntimeUrlBase,
    ok: hasUnsubscribeLink && (!usesRuntimeUnsubscribe || hasRuntimeUrlBase),
  };
}

const MERGE_TAG_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
const RUNTIME_MERGE_TAGS = new Set(["unsubscribeUrl", "viewInBrowserUrl"]);

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function extractMergeTags(value) {
  const tags = [];
  const text = String(value || "");
  let match;
  while ((match = MERGE_TAG_RE.exec(text))) tags.push(match[1]);
  return unique(tags);
}

function pathExists(obj, path) {
  if (!obj || typeof obj !== "object") return false;
  return String(path || "")
    .split(".")
    .every((key, index, parts) => {
      const parent = parts.slice(0, index).reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
      return parent && Object.prototype.hasOwnProperty.call(parent, key) && parent[key] !== undefined && parent[key] !== null;
    });
}

function sampleMergeData({ recipients = [], data = {} } = {}) {
  const recipient = recipients[0] || {};
  const recipientData = recipient.data && typeof recipient.data === "object" ? recipient.data : {};
  const contact = {
    email: recipient.email || "",
    ...(data.contact && typeof data.contact === "object" ? data.contact : {}),
    ...(recipientData.contact && typeof recipientData.contact === "object" ? recipientData.contact : {}),
  };
  return {
    ...data,
    ...recipientData,
    contact,
    unsubscribeUrl: "https://example.test/unsubscribe",
    viewInBrowserUrl: "https://example.test/view",
  };
}

function collectHtmlUrls(text) {
  const urls = [];
  const html = String(text || "");
  const attrRe = /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi;
  const cssUrlRe = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  let match;
  while ((match = attrRe.exec(html))) urls.push({ url: match[1], field: "html" });
  while ((match = cssUrlRe.exec(html))) urls.push({ url: match[1], field: "css" });
  return urls;
}

function collectValueUrls(value, field = "") {
  if (Array.isArray(value)) return value.flatMap((item, index) => collectValueUrls(item, `${field}.${index}`));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) => {
    const nextField = field ? `${field}.${key}` : key;
    if (typeof nested === "string" && /(href|url|src|image|poster|feed)/i.test(key)) {
      return [{ url: nested, field: nextField }];
    }
    return collectValueUrls(nested, nextField);
  });
}

function normalizeUrlValue(value) {
  return String(value || "").trim();
}

function isRuntimeUrl(value) {
  return /\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/.test(String(value || ""));
}

function isDangerousUrl(value) {
  const url = normalizeUrlValue(value).toLowerCase();
  return /^(javascript|vbscript):/.test(url) || /^data:(text\/html|application\/javascript|text\/javascript)/.test(url);
}

function isPlaceholderUrl(value) {
  const url = normalizeUrlValue(value).toLowerCase();
  if (!url || url === "#") return true;
  return /example\.(com|test|org)|yourdomain|placeholder|change-me|changeme|todo/.test(url);
}

function isUnsupportedEmailUrl(value) {
  const url = normalizeUrlValue(value);
  if (!url || isRuntimeUrl(url) || url === "#") return false;
  return !/^(https?:|mailto:|tel:)/i.test(url);
}

function isHttpImageUrl(value) {
  return /^http:\/\//i.test(normalizeUrlValue(value));
}

function addTemplateCheck(checks, key, ok, message, severity = "error", meta = {}) {
  checks.push({ key, ok, message, severity, ...meta });
}

function templatePlainContent(template) {
  if (!template) return "";
  if (template.editorType === "design") {
    return collectDesignBlocks(template.designJson || {})
      .map((block) => stripHtml([block.content, block.settings?.title, block.settings?.subtitle].filter(Boolean).join(" ")))
      .join(" ");
  }
  return stripHtml([template.htmlBody, template.plainText].filter(Boolean).join(" "));
}

function validateTemplateBeforeSend(template, { subject, recipients = [], data = {} } = {}) {
  const checks = [];
  const warnings = [];
  const errors = [];
  const blocks = template?.editorType === "design" ? collectDesignBlocks(template.designJson || {}) : [];
  const sections = template?.editorType === "design" && Array.isArray(template.designJson?.sections) ? template.designJson.sections : [];
  const text = [subject, templateText(template)].filter(Boolean).join(" ");
  const plainContent = templatePlainContent(template);

  const pushIssue = (key, message, severity = "warning", meta = {}) => {
    const issue = { key, message, severity, ...meta };
    if (severity === "error") errors.push(issue);
    else warnings.push(issue);
    addTemplateCheck(checks, key, false, message, severity, meta);
  };

  try {
    if (template?.editorType === "design") validateDesign(template.designJson || {});
  } catch (err) {
    pushIssue("templateSchema", err.message || "Template design schema is invalid.", "error");
  }

  if (!plainContent && !blocks.some((block) => ["image", "logo", "video", "products", "shopping_cart"].includes(block.type))) {
    pushIssue("templateContent", "Template body is empty. Add text, image, button, or footer content before sending.", "error");
  } else if (/start from scratch|write your text here|click here/i.test(plainContent)) {
    pushIssue("placeholderCopy", "Template still contains starter placeholder copy. Review it before real send.", "warning");
  } else {
    addTemplateCheck(checks, "templateContent", true, "Template has body content.", "info");
  }

  const mergeTags = extractMergeTags(text);
  const mergeData = sampleMergeData({ recipients, data });
  const missingTags = mergeTags.filter((tag) => !RUNTIME_MERGE_TAGS.has(tag) && !pathExists(mergeData, tag));
  if (missingTags.length) {
    pushIssue(
      "mergeTags",
      `Sample data is missing merge tag values: ${missingTags.slice(0, 6).join(", ")}${missingTags.length > 6 ? "…" : ""}.`,
      "warning",
      { tags: missingTags }
    );
  } else {
    addTemplateCheck(checks, "mergeTags", true, mergeTags.length ? "Merge tags resolve with current sample data." : "No custom merge tags found.", "info");
  }

  const designUrls = template?.editorType === "design" ? collectValueUrls(template.designJson || {}) : [];
  const htmlUrls = collectHtmlUrls([
    template.htmlBody,
    template.plainText,
    template?.editorType === "design" ? templateText(template) : "",
  ].filter(Boolean).join(" "));
  const urls = [...designUrls, ...htmlUrls].filter((item) => normalizeUrlValue(item.url) && !isRuntimeUrl(item.url));
  const dangerousUrls = urls.filter((item) => isDangerousUrl(item.url));
  const unsupportedUrls = urls.filter((item) => isUnsupportedEmailUrl(item.url));
  const placeholderUrls = urls.filter((item) => isPlaceholderUrl(item.url));
  if (dangerousUrls.length) {
    pushIssue("unsafeUrls", "Template contains unsafe javascript/data URLs. Replace them before sending.", "error", {
      urls: dangerousUrls.slice(0, 5),
    });
  } else if (unsupportedUrls.length) {
    pushIssue("unsupportedUrls", "Some links are relative or unsupported for email. Use full https, mailto, or tel URLs.", "warning", {
      urls: unsupportedUrls.slice(0, 5),
    });
  } else {
    addTemplateCheck(checks, "safeUrls", true, "Links use email-safe protocols.", "info");
  }
  if (placeholderUrls.length) {
    pushIssue("placeholderUrls", "Some links still look like placeholders (#, example.com, or TODO).", "warning", {
      urls: placeholderUrls.slice(0, 5),
    });
  }

  const imageBlocks = blocks.filter((block) => ["image", "logo"].includes(block.type));
  const missingImages = imageBlocks.filter((block) => !normalizeUrlValue(block.settings?.src || block.src));
  const missingAlt = imageBlocks.filter((block) => normalizeUrlValue(block.settings?.src || block.src) && !normalizeUrlValue(block.settings?.alt));
  const insecureImages = urls.filter((item) => /(src|image|poster)/i.test(item.field) && isHttpImageUrl(item.url));
  if (missingImages.length) {
    pushIssue("missingImages", `${missingImages.length} image/logo block${missingImages.length === 1 ? "" : "s"} have no image URL.`, "warning");
  }
  if (missingAlt.length) {
    pushIssue("imageAlt", `${missingAlt.length} image/logo block${missingAlt.length === 1 ? " is" : "s are"} missing alt text.`, "warning");
  }
  if (insecureImages.length) {
    pushIssue("imageHttps", "Some image URLs use http. Use https for better inbox rendering.", "warning", {
      urls: insecureImages.slice(0, 5),
    });
  }
  if (!missingImages.length && !missingAlt.length && !insecureImages.length) {
    addTemplateCheck(checks, "images", true, imageBlocks.length ? "Image blocks have URLs and alt text." : "No required image fixes found.", "info");
  }

  const nonStackingSections = sections.filter((section) => (section.columns || []).length > 1 && section.settings?.mobileStack === false);
  if (nonStackingSections.length) {
    pushIssue("mobileStacking", "A multi-column section has mobile stacking disabled. Verify it in mobile preview before sending.", "warning");
  } else {
    addTemplateCheck(checks, "mobileReady", true, "Multi-column sections are mobile stackable by default.", "info");
  }

  return {
    ok: errors.length === 0,
    checks,
    warnings,
    errors,
  };
}

async function findExistingCampaignRecipient(campaignId, email) {
  const { CrmMarketingMessage } = getModels();
  return CrmMarketingMessage.findOne({
    where: {
      campaignId,
      recipient: { [Op.iLike]: email },
      status: { [Op.notIn]: ["failed", "cancelled"] },
    },
    order: [["createdAt", "DESC"]],
  });
}

// ── Folders ─────────────────────────────────────────────────────────

function serializeFolder(row) {
  return {
    id: row.id,
    locationId: row.locationId,
    name: row.name,
    parentId: row.parentId,
    kind: row.kind,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function listFolders({ locationId, kind, parentId } = {}) {
  const loc = requireLocation(locationId);
  const { CrmMarketingFolder } = getModels();
  const where = { locationId: loc };
  if (kind) where.kind = kind;
  if (parentId === "null" || parentId === null || parentId === undefined) {
    where.parentId = null;
  } else if (parentId) {
    where.parentId = parentId;
  }
  const rows = await CrmMarketingFolder.findAll({
    where,
    order: [["name", "ASC"]],
  });
  return rows.map(serializeFolder);
}

async function createFolder({ locationId, name, kind, parentId } = {}) {
  const loc = requireLocation(locationId);
  validate([
    !name && { field: "name", message: "Folder name is required." },
    !VALID_FOLDER_KINDS.includes(kind) && {
      field: "kind",
      message: `Folder kind must be one of: ${VALID_FOLDER_KINDS.join(", ")}.`,
    },
  ]);
  const { CrmMarketingFolder } = getModels();
  const row = await CrmMarketingFolder.create({
    locationId: loc,
    name: String(name).trim(),
    kind,
    parentId: parentId || null,
  });
  return serializeFolder(row);
}

async function deleteFolder(id) {
  const { CrmMarketingFolder, CrmMarketingTemplate, CrmMarketingCampaign, CrmMarketingAsset } = getModels();
  const row = await CrmMarketingFolder.findByPk(id);
  if (!row) throw notFound("Folder");
  const snapshot = serializeFolder(row);
  // Detach children — don't cascade-delete user content.
  await CrmMarketingTemplate.update({ folderId: null }, { where: { folderId: row.id } });
  await CrmMarketingCampaign.update({ folderId: null }, { where: { folderId: row.id } });
  await CrmMarketingAsset.update({ folderId: null }, { where: { folderId: row.id } });
  await CrmMarketingFolder.update({ parentId: null }, { where: { parentId: row.id } });
  await row.destroy();
  return snapshot;
}

// ── Assets ─────────────────────────────────────────────────────────

function safeAssetUrl(value) {
  const url = String(value || "").trim();
  if (/^https?:\/\//i.test(url)) return url;
  return "";
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 12);
  if (typeof tags === "string") return tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
  return [];
}

function serializeAsset(row) {
  return {
    id: row.id,
    locationId: row.locationId,
    folderId: row.folderId,
    name: row.name,
    assetType: row.assetType,
    url: row.url,
    thumbnailUrl: row.thumbnailUrl,
    altText: row.altText,
    tags: row.tags || [],
    width: row.width,
    height: row.height,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    source: row.source,
    createdByUserId: row.createdByUserId,
    createdByName: row.createdByName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function listAssets({ locationId, folderId, assetType, q, tag, limit = 80 } = {}) {
  const loc = requireLocation(locationId);
  const { CrmMarketingAsset } = getModels();
  const where = { locationId: loc };
  if (folderId && folderId !== "all") where.folderId = folderId === "null" ? null : folderId;
  if (assetType && assetType !== "all") where.assetType = assetType;
  if (q) where.name = { [Op.iLike]: `%${q}%` };
  if (tag) where.tags = { [Op.contains]: [String(tag)] };
  const rows = await CrmMarketingAsset.findAll({
    where,
    order: [["updatedAt", "DESC"]],
    limit: Math.min(Number(limit) || 80, 200),
  });
  return { items: rows.map(serializeAsset) };
}

async function createAsset({ locationId, name, assetType = "image", url, thumbnailUrl, altText, tags, folderId, width, height, mimeType, sizeBytes, user } = {}) {
  const loc = requireLocation(locationId);
  const safeUrl = safeAssetUrl(url);
  validate([
    !name && { field: "name", message: "Asset name is required." },
    !VALID_ASSET_TYPES.includes(assetType) && {
      field: "assetType",
      message: `Asset type must be one of: ${VALID_ASSET_TYPES.join(", ")}.`,
    },
    !safeUrl && { field: "url", message: "Asset URL must start with http:// or https://." },
  ]);
  const { CrmMarketingAsset } = getModels();
  const row = await CrmMarketingAsset.create({
    locationId: loc,
    folderId: folderId || null,
    name: String(name).trim(),
    assetType,
    url: safeUrl,
    thumbnailUrl: safeAssetUrl(thumbnailUrl) || safeUrl,
    altText: altText || "",
    tags: normalizeTags(tags),
    width: width ? Number(width) : null,
    height: height ? Number(height) : null,
    mimeType: mimeType || null,
    sizeBytes: sizeBytes ? Number(sizeBytes) : null,
    source: "url",
    createdByUserId: user?.user_id || null,
    createdByName: user?.name || null,
  });
  return serializeAsset(row);
}

async function uploadAsset({ locationId, name, assetType = "image", fileName, dataUrl, altText, tags, folderId, user } = {}) {
  const loc = requireLocation(locationId);
  const uploaded = await uploadMarketingAsset({ locationId: loc, fileName, dataUrl });
  return createAsset({
    locationId: loc,
    name: name || fileName || "Uploaded image",
    assetType: assetType === "background" ? "image" : assetType,
    url: uploaded.url,
    thumbnailUrl: uploaded.url,
    altText,
    tags,
    folderId,
    width: uploaded.width,
    height: uploaded.height,
    mimeType: uploaded.mimeType,
    sizeBytes: uploaded.sizeBytes,
    user,
  });
}

async function updateAsset(id, body = {}) {
  const { CrmMarketingAsset } = getModels();
  const row = await CrmMarketingAsset.findByPk(id);
  if (!row) throw notFound("Asset");
  const nextUrl = body.url === undefined ? row.url : safeAssetUrl(body.url);
  if (body.url !== undefined && !nextUrl) validate([{ field: "url", message: "Asset URL must start with http:// or https://." }]);
  if (body.assetType && !VALID_ASSET_TYPES.includes(body.assetType)) {
    validate([{ field: "assetType", message: `Asset type must be one of: ${VALID_ASSET_TYPES.join(", ")}.` }]);
  }
  await row.update({
    name: body.name ?? row.name,
    folderId: body.folderId === null ? null : body.folderId ?? row.folderId,
    assetType: body.assetType ?? row.assetType,
    url: nextUrl,
    thumbnailUrl: body.thumbnailUrl === undefined ? row.thumbnailUrl : safeAssetUrl(body.thumbnailUrl) || nextUrl,
    altText: body.altText ?? row.altText,
    tags: body.tags === undefined ? row.tags : normalizeTags(body.tags),
    width: body.width === undefined ? row.width : body.width ? Number(body.width) : null,
    height: body.height === undefined ? row.height : body.height ? Number(body.height) : null,
    mimeType: body.mimeType ?? row.mimeType,
    sizeBytes: body.sizeBytes === undefined ? row.sizeBytes : body.sizeBytes ? Number(body.sizeBytes) : null,
  });
  return serializeAsset(row);
}

async function deleteAsset(id) {
  const { CrmMarketingAsset } = getModels();
  const row = await CrmMarketingAsset.findByPk(id);
  if (!row) throw notFound("Asset");
  const snapshot = serializeAsset(row);
  await row.destroy();
  return snapshot;
}

// ── Saved Sections / Blocks ────────────────────────────────────────

function serializeSnippet(row) {
  return {
    id: row.id,
    locationId: row.locationId,
    name: row.name,
    snippetType: row.snippetType,
    category: row.category,
    tags: row.tags || [],
    previewText: row.previewText,
    designJson: row.designJson,
    createdByUserId: row.createdByUserId,
    createdByName: row.createdByName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function previewFromDesign(snippetType, designJson) {
  if (snippetType === "block") return String(designJson?.content || designJson?.type || "Block").slice(0, 280);
  const firstBlock = (designJson?.columns || []).flatMap((column) => column.blocks || [])[0];
  return String(firstBlock?.content || firstBlock?.type || "Section").replace(/<[^>]+>/g, "").slice(0, 280);
}

async function listSnippets({ locationId, snippetType, category, q, tag, limit = 100 } = {}) {
  const loc = requireLocation(locationId);
  const { CrmMarketingSnippet } = getModels();
  const where = { locationId: loc };
  if (snippetType && snippetType !== "all") where.snippetType = snippetType;
  if (category && category !== "all") where.category = category;
  if (q) where.name = { [Op.iLike]: `%${q}%` };
  if (tag) where.tags = { [Op.contains]: [String(tag)] };
  const rows = await CrmMarketingSnippet.findAll({
    where,
    order: [["updatedAt", "DESC"]],
    limit: Math.min(Number(limit) || 100, 250),
  });
  return { items: rows.map(serializeSnippet) };
}

async function createSnippet({ locationId, name, snippetType, category = "custom", tags, designJson, previewText, user } = {}) {
  const loc = requireLocation(locationId);
  validate([
    !name && { field: "name", message: "Snippet name is required." },
    !VALID_SNIPPET_TYPES.includes(snippetType) && {
      field: "snippetType",
      message: `Snippet type must be one of: ${VALID_SNIPPET_TYPES.join(", ")}.`,
    },
    !designJson || typeof designJson !== "object"
      ? { field: "designJson", message: "Snippet designJson is required." }
      : null,
  ]);
  const { CrmMarketingSnippet } = getModels();
  const row = await CrmMarketingSnippet.create({
    locationId: loc,
    name: String(name).trim(),
    snippetType,
    category: String(category || "custom").trim(),
    tags: normalizeTags(tags),
    designJson,
    previewText: previewText || previewFromDesign(snippetType, designJson),
    createdByUserId: user?.user_id || null,
    createdByName: user?.name || null,
  });
  return serializeSnippet(row);
}

async function updateSnippet(id, body = {}) {
  const { CrmMarketingSnippet } = getModels();
  const row = await CrmMarketingSnippet.findByPk(id);
  if (!row) throw notFound("Snippet");
  if (body.snippetType && !VALID_SNIPPET_TYPES.includes(body.snippetType)) {
    validate([{ field: "snippetType", message: `Snippet type must be one of: ${VALID_SNIPPET_TYPES.join(", ")}.` }]);
  }
  await row.update({
    name: body.name ?? row.name,
    snippetType: body.snippetType ?? row.snippetType,
    category: body.category ?? row.category,
    tags: body.tags === undefined ? row.tags : normalizeTags(body.tags),
    designJson: body.designJson ?? row.designJson,
    previewText: body.previewText ?? row.previewText,
  });
  return serializeSnippet(row);
}

async function deleteSnippet(id) {
  const { CrmMarketingSnippet } = getModels();
  const row = await CrmMarketingSnippet.findByPk(id);
  if (!row) throw notFound("Snippet");
  const snapshot = serializeSnippet(row);
  await row.destroy();
  return snapshot;
}

// ── Templates ───────────────────────────────────────────────────────

function serializeTemplate(row) {
  return {
    id: row.id,
    locationId: row.locationId,
    folderId: row.folderId,
    name: row.name,
    editorType: row.editorType,
    useCase: row.useCase || "marketing",
    htmlBody: row.htmlBody,
    designJson: row.designJson,
    plainText: row.plainText,
    updatedByUserId: row.updatedByUserId,
    updatedByName: row.updatedByName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializeRevision(row) {
  return {
    id: row.id,
    templateId: row.templateId,
    locationId: row.locationId,
    revisionNumber: row.revisionNumber,
    name: row.name,
    editorType: row.editorType,
    useCase: row.useCase,
    htmlBody: row.htmlBody,
    designJson: row.designJson,
    plainText: row.plainText,
    updatedByUserId: row.updatedByUserId,
    updatedByName: row.updatedByName,
    reason: row.reason,
    createdAt: row.createdAt,
  };
}

async function createTemplateRevision(row, { user, reason = "save" } = {}) {
  const { CrmMarketingTemplateRevision } = getModels();
  const latest = await CrmMarketingTemplateRevision.max("revisionNumber", {
    where: { templateId: row.id },
  });
  const revision = await CrmMarketingTemplateRevision.create({
    templateId: row.id,
    locationId: row.locationId,
    revisionNumber: Number(latest || 0) + 1,
    name: row.name,
    editorType: row.editorType,
    useCase: row.useCase || "marketing",
    htmlBody: row.htmlBody,
    designJson: row.designJson,
    plainText: row.plainText,
    updatedByUserId: user?.user_id ?? row.updatedByUserId,
    updatedByName: user?.name ?? row.updatedByName,
    reason,
  });
  return serializeRevision(revision);
}

async function listTemplates({ locationId, folderId, q, useCase } = {}) {
  const loc = requireLocation(locationId);
  const { CrmMarketingTemplate } = getModels();
  const where = { locationId: loc };
  if (folderId === "null" || folderId === null || folderId === undefined) {
    where.folderId = null;
  } else {
    where.folderId = folderId;
  }
  if (q) where.name = { [Op.iLike]: `%${q}%` };
  // Marketing table only stores marketing templates. Transactional
  // templates live in crm_transactional_templates (separate API).
  // The useCase column is retained for legacy filtering but new rows
  // are always 'marketing'.
  if (useCase) where.useCase = useCase;
  const rows = await CrmMarketingTemplate.findAll({
    where,
    order: [["updatedAt", "DESC"]],
  });
  return rows.map(serializeTemplate);
}

async function getTemplate(id) {
  const { CrmMarketingTemplate } = getModels();
  const row = await CrmMarketingTemplate.findByPk(id);
  if (!row) throw notFound("Template");
  return serializeTemplate(row);
}

async function createTemplate({ locationId, name, editorType = "design", useCase = "marketing", folderId, htmlBody, designJson, plainText, user } = {}) {
  const loc = requireLocation(locationId);
  validate([
    !name && { field: "name", message: "Template name is required." },
    !VALID_EDITOR_TYPES.includes(editorType) && {
      field: "editorType",
      message: `Editor type must be one of: ${VALID_EDITOR_TYPES.join(", ")}.`,
    },
    !VALID_TEMPLATE_USE_CASES.includes(useCase) && {
      field: "useCase",
      message: `Use case must be one of: ${VALID_TEMPLATE_USE_CASES.join(", ")}.`,
    },
  ]);
  const { CrmMarketingTemplate } = getModels();
  const nextDesignJson = editorType === "design" ? designJson || createDefaultDesign() : designJson || null;
  if (nextDesignJson) validateDesign(nextDesignJson);
  const nextHtmlBody = editorType === "design" && !htmlBody
    ? renderDesign(nextDesignJson, { title: name }).html
    : htmlBody || null;
  const row = await CrmMarketingTemplate.create({
    locationId: loc,
    folderId: folderId || null,
    name: String(name).trim(),
    editorType,
    useCase,
    htmlBody: nextHtmlBody,
    designJson: nextDesignJson,
    plainText: plainText || null,
    updatedByUserId: user?.user_id || null,
    updatedByName: user?.name || null,
  });
  await createTemplateRevision(row, { user, reason: "create" });
  return serializeTemplate(row);
}

async function updateTemplate(id, body = {}, user) {
  const { CrmMarketingTemplate } = getModels();
  const row = await CrmMarketingTemplate.findByPk(id);
  if (!row) throw notFound("Template");
  if (body.editorType && !VALID_EDITOR_TYPES.includes(body.editorType)) {
    validate([{ field: "editorType", message: `Editor type must be one of: ${VALID_EDITOR_TYPES.join(", ")}.` }]);
  }
  if (body.useCase && !VALID_TEMPLATE_USE_CASES.includes(body.useCase)) {
    validate([{ field: "useCase", message: `Use case must be one of: ${VALID_TEMPLATE_USE_CASES.join(", ")}.` }]);
  }
  const nextEditorType = body.editorType ?? row.editorType;
  const nextDesignJson = body.designJson ?? row.designJson;
  if (nextEditorType === "design" && nextDesignJson) validateDesign(nextDesignJson);
  const shouldRenderHtml =
    nextEditorType === "design" &&
    body.htmlBody === undefined &&
    (body.designJson !== undefined || !row.htmlBody);
  const nextHtmlBody = shouldRenderHtml
    ? renderDesign(nextDesignJson || createDefaultDesign(), { title: body.name ?? row.name }).html
    : body.htmlBody ?? row.htmlBody;

  await row.update({
    name: body.name ?? row.name,
    folderId: body.folderId === null ? null : body.folderId ?? row.folderId,
    editorType: nextEditorType,
    useCase: body.useCase ?? row.useCase,
    htmlBody: nextHtmlBody,
    designJson: nextDesignJson,
    plainText: body.plainText ?? row.plainText,
    updatedByUserId: user?.user_id ?? row.updatedByUserId,
    updatedByName: user?.name ?? row.updatedByName,
  });
  await createTemplateRevision(row, { user, reason: body.revisionReason || "save" });
  return serializeTemplate(row);
}

async function listTemplateRevisions(templateId) {
  const { CrmMarketingTemplate, CrmMarketingTemplateRevision } = getModels();
  const template = await CrmMarketingTemplate.findByPk(templateId);
  if (!template) throw notFound("Template");
  const rows = await CrmMarketingTemplateRevision.findAll({
    where: { templateId },
    order: [["revisionNumber", "DESC"]],
  });
  return { items: rows.map(serializeRevision) };
}

async function getTemplateRevision(templateId, revisionId) {
  const { CrmMarketingTemplateRevision } = getModels();
  const row = await CrmMarketingTemplateRevision.findOne({ where: { id: revisionId, templateId } });
  if (!row) throw notFound("Revision");
  return serializeRevision(row);
}

async function restoreTemplateRevision(templateId, revisionId, user) {
  const { CrmMarketingTemplate, CrmMarketingTemplateRevision } = getModels();
  const template = await CrmMarketingTemplate.findByPk(templateId);
  if (!template) throw notFound("Template");
  const revision = await CrmMarketingTemplateRevision.findOne({ where: { id: revisionId, templateId } });
  if (!revision) throw notFound("Revision");
  await template.update({
    name: revision.name,
    editorType: revision.editorType,
    useCase: revision.useCase,
    htmlBody: revision.htmlBody,
    designJson: revision.designJson,
    plainText: revision.plainText,
    updatedByUserId: user?.user_id ?? template.updatedByUserId,
    updatedByName: user?.name ?? template.updatedByName,
  });
  await createTemplateRevision(template, { user, reason: `restore:${revision.revisionNumber}` });
  return serializeTemplate(template);
}

async function renderTemplate(id, { data } = {}) {
  const template = await getTemplate(id);
  if (template.editorType === "design") {
    const rendered = renderDesign(template.designJson || createDefaultDesign(), {
      title: template.name,
      data: data || {},
    });
    return {
      editorType: template.editorType,
      htmlBody: rendered.html,
      designJson: rendered.design,
    };
  }
  return {
    editorType: template.editorType,
    htmlBody: template.htmlBody || "",
    plainText: template.plainText || "",
  };
}

function renderDraftTemplate({ name = "Draft email", designJson, data } = {}) {
  if (designJson) validateDesign(designJson);
  const rendered = renderDesign(designJson || createDefaultDesign(), {
    title: name,
    data: data || {},
  });
  return {
    editorType: "design",
    htmlBody: rendered.html,
    designJson: rendered.design,
  };
}

async function sendTestTemplate(id, { to, subject, data, from } = {}) {
  validate([
    !EMAIL_RE.test(String(to || "").trim()) && { field: "to", message: "Valid test recipient email is required." },
  ]);
  const template = await getTemplate(id);
  const templateValidation = validateTemplateBeforeSend(template, {
    subject: subject || `[Test] ${template.name}`,
    recipients: [{ email: String(to).trim(), data: data || {} }],
    data: data || {},
  });
  validate(templateValidation.errors.map((issue) => ({ field: issue.key, message: issue.message })));
  const htmlBody = template.editorType === "design"
    ? renderDesign(template.designJson || createDefaultDesign(), { title: template.name, data: data || {} }).html
    : template.htmlBody || "";
  const send = template.useCase === "transactional"
    ? emailProvider.sendTransactionalEmail
    : emailProvider.sendMarketingEmail;
  const result = await send({
    locationId: template.locationId,
    to: String(to).trim(),
    subject: subject || `[Test] ${template.name}`,
    html: htmlBody,
    from,
    trackingTags: [
      { name: "purpose", value: "test_send" },
      { name: "template_id", value: template.id },
    ],
  });
  return {
    ok: true,
    to: String(to).trim(),
    subject: subject || `[Test] ${template.name}`,
    useCase: template.useCase,
    provider: result.provider,
    providerMessageId: result.providerMessageId,
  };
}

async function sendTestDraftTemplate({ to, subject, name = "Draft email", useCase = "marketing", designJson, data, from } = {}) {
  validate([
    !EMAIL_RE.test(String(to || "").trim()) && { field: "to", message: "Valid test recipient email is required." },
    !subject && { field: "subject", message: "Subject is required for test send." },
    designJson && typeof designJson === "object" ? null : { field: "designJson", message: "designJson is required." },
  ]);
  if (designJson) validateDesign(designJson);
  const templateValidation = validateTemplateBeforeSend({
    name,
    editorType: "design",
    useCase,
    designJson,
    htmlBody: null,
    plainText: null,
  }, {
    subject,
    recipients: [{ email: String(to).trim(), data: data || {} }],
    data: data || {},
  });
  validate(templateValidation.errors.map((issue) => ({ field: issue.key, message: issue.message })));
  const rendered = renderDesign(designJson || createDefaultDesign(), { title: name, data: data || {} });
  const send = useCase === "transactional"
    ? emailProvider.sendTransactionalEmail
    : emailProvider.sendMarketingEmail;
  const result = await send({
    locationId: null,
    to: String(to).trim(),
    subject,
    html: rendered.html,
    from,
    trackingTags: [{ name: "purpose", value: "draft_test_send" }],
  });
  return {
    ok: true,
    to: String(to).trim(),
    subject,
    useCase,
    provider: result.provider,
    providerMessageId: result.providerMessageId,
  };
}

async function deleteTemplate(id) {
  const { CrmMarketingTemplate, CrmMarketingCampaign } = getModels();
  const row = await CrmMarketingTemplate.findByPk(id);
  if (!row) throw notFound("Template");
  const snapshot = serializeTemplate(row);
  // Don't break campaigns that reference this template — null the link.
  await CrmMarketingCampaign.update({ templateId: null }, { where: { templateId: row.id } });
  await row.destroy();
  return snapshot;
}

// ── Campaigns ───────────────────────────────────────────────────────

function serializeCampaign(row) {
  return {
    id: row.id,
    locationId: row.locationId,
    folderId: row.folderId,
    name: row.name,
    channel: row.channel,
    campaignType: row.campaignType,
    templateId: row.templateId,
    status: row.status,
    scheduledAt: row.scheduledAt,
    executionDate: row.executionDate,
    metrics: {
      recipients: row.totalRecipients,
      delivered: row.totalDelivered,
      opened: row.totalOpened,
      clicked: row.totalClicked,
      bounced: row.totalBounced,
      unsubscribed: row.totalUnsubscribed,
      complained: row.totalComplained,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializeMessage(row) {
  return {
    id: row.id,
    locationId: row.locationId,
    campaignId: row.campaignId,
    templateId: row.templateId,
    channel: row.channel,
    recipient: row.recipient,
    subject: row.subject,
    status: row.status,
    provider: row.provider,
    providerMessageId: row.providerMessageId,
    metadata: row.metadata || {},
    queuedAt: row.queuedAt,
    sentAt: row.sentAt,
    deliveredAt: row.deliveredAt,
    openedAt: row.openedAt,
    clickedAt: row.clickedAt,
    bouncedAt: row.bouncedAt,
    complainedAt: row.complainedAt,
    unsubscribedAt: row.unsubscribedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializeDeliveryEvent(row) {
  return {
    id: row.id,
    messageId: row.messageId,
    campaignId: row.campaignId,
    provider: row.provider,
    providerMessageId: row.providerMessageId,
    eventType: row.eventType,
    payload: row.payload || {},
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
  };
}

function messageFailureReason(row) {
  const metadata = row?.metadata || {};
  return metadata.lastError || metadata.error || metadata.retryError || "Unknown failure";
}

function failureGroupKey(reason) {
  return String(reason || "Unknown failure")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "{uuid}")
    .replace(/\b\d{4,}\b/g, "{number}")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "Unknown failure";
}

function serializeFailedMessage(row) {
  return {
    ...serializeMessage(row),
    campaign: row.campaign ? serializeCampaign(row.campaign) : null,
    lastError: messageFailureReason(row),
    failureGroup: failureGroupKey(messageFailureReason(row)),
    retryCount: Number(row.metadata?.retryCount || 0),
    lastRetryAt: row.metadata?.lastRetryAt || null,
    failedAt: row.metadata?.failedAt || null,
  };
}

async function listCampaigns({ locationId, folderId, campaignType, q, status, page = 1, pageSize = 10 } = {}) {
  const loc = requireLocation(locationId);
  const { CrmMarketingCampaign } = getModels();
  const where = { locationId: loc };
  if (folderId === "null" || folderId === null || folderId === undefined) {
    where.folderId = null;
  } else {
    where.folderId = folderId;
  }
  if (campaignType) where.campaignType = campaignType;
  if (status) where.status = status;
  if (q) where.name = { [Op.iLike]: `%${q}%` };

  const limit = Math.min(100, Math.max(1, Number(pageSize) || 10));
  const offset = Math.max(0, (Number(page) - 1) * limit);
  const { rows, count } = await CrmMarketingCampaign.findAndCountAll({
    where,
    order: [["updatedAt", "DESC"]],
    limit,
    offset,
  });
  return {
    items: rows.map(serializeCampaign),
    total: count,
    page: Number(page) || 1,
    pageSize: limit,
  };
}

async function listCampaignMessages(campaignId, { q, status, page = 1, pageSize = 25 } = {}) {
  const { CrmMarketingCampaign, CrmMarketingMessage } = getModels();
  const campaign = await CrmMarketingCampaign.findByPk(campaignId);
  if (!campaign) throw notFound("Campaign");

  const where = { campaignId };
  if (status) where.status = status;
  if (q) {
    where[Op.or] = [
      { recipient: { [Op.iLike]: `%${q}%` } },
      { subject: { [Op.iLike]: `%${q}%` } },
      { providerMessageId: { [Op.iLike]: `%${q}%` } },
    ];
  }

  const limit = Math.min(100, Math.max(1, Number(pageSize) || 25));
  const offset = Math.max(0, (Number(page) - 1) * limit);
  const { rows, count } = await CrmMarketingMessage.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  return {
    campaign: serializeCampaign(campaign),
    items: rows.map(serializeMessage),
    total: count,
    page: Number(page) || 1,
    pageSize: limit,
  };
}

async function listMessageEvents(messageId) {
  const { CrmMarketingMessage, CrmMarketingDeliveryEvent } = getModels();
  const message = await CrmMarketingMessage.findByPk(messageId);
  if (!message) throw notFound("Marketing message");
  const rows = await CrmMarketingDeliveryEvent.findAll({
    where: { messageId },
    order: [["occurredAt", "DESC"]],
    limit: 100,
  });
  return {
    message: serializeMessage(message),
    items: rows.map(serializeDeliveryEvent),
  };
}

async function listFailedMessages({ locationId, campaignId, q, failureGroup, page = 1, pageSize = 25 } = {}) {
  const loc = requireLocation(locationId);
  const { CrmMarketingCampaign, CrmMarketingMessage } = getModels();
  const where = { locationId: loc, status: "failed" };
  if (campaignId) where.campaignId = campaignId;
  if (q) {
    where[Op.or] = [
      { recipient: { [Op.iLike]: `%${q}%` } },
      { subject: { [Op.iLike]: `%${q}%` } },
      { providerMessageId: { [Op.iLike]: `%${q}%` } },
    ];
  }

  const allFailed = await CrmMarketingMessage.findAll({
    where,
    include: [{ model: CrmMarketingCampaign, as: "campaign", required: false }],
    order: [["updatedAt", "DESC"]],
    limit: 500,
  });
  const groupsMap = new Map();
  for (const row of allFailed) {
    const reason = messageFailureReason(row);
    const key = failureGroupKey(reason);
    const group = groupsMap.get(key) || {
      key,
      reason,
      count: 0,
      latestAt: row.updatedAt,
      sampleRecipients: [],
    };
    group.count += 1;
    if (group.sampleRecipients.length < 3) group.sampleRecipients.push(row.recipient);
    if (new Date(row.updatedAt) > new Date(group.latestAt)) group.latestAt = row.updatedAt;
    groupsMap.set(key, group);
  }

  const filtered = failureGroup
    ? allFailed.filter((row) => failureGroupKey(messageFailureReason(row)) === failureGroup)
    : allFailed;
  const limit = Math.min(100, Math.max(1, Number(pageSize) || 25));
  const currentPage = Math.max(1, Number(page) || 1);
  const offset = (currentPage - 1) * limit;
  const items = filtered.slice(offset, offset + limit);

  return {
    items: items.map(serializeFailedMessage),
    total: filtered.length,
    page: currentPage,
    pageSize: limit,
    groups: Array.from(groupsMap.values()).sort((a, b) => b.count - a.count || new Date(b.latestAt) - new Date(a.latestAt)),
  };
}

async function createCampaign({ locationId, name, folderId, campaignType = "email_campaign", templateId, scheduledAt } = {}) {
  const loc = requireLocation(locationId);
  validate([
    !name && { field: "name", message: "Campaign name is required." },
  ]);
  const { CrmMarketingCampaign } = getModels();
  const row = await CrmMarketingCampaign.create({
    locationId: loc,
    folderId: folderId || null,
    name: String(name).trim(),
    channel: "email",
    campaignType,
    templateId: templateId || null,
    status: scheduledAt ? "scheduled" : "draft",
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
  });
  return serializeCampaign(row);
}

async function preflightCampaignMessages(campaignId, body = {}) {
  const { CrmMarketingCampaign, CrmMarketingTemplate } = getModels();
  const campaign = await CrmMarketingCampaign.findByPk(campaignId);
  if (!campaign) throw notFound("Campaign");

  const recipientInput = Array.isArray(body.recipients) ? body.recipients : [];
  const recipients = normalizeRecipients(recipientInput);
  const invalid = recipientInput
    .map((item, index) => ({ index, email: recipientEmail(item) }))
    .filter((item) => !EMAIL_RE.test(item.email));
  const templateId = body.templateId || campaign.templateId;
  const checks = [];
  let template = null;
  let templateValidation = null;

  if (!templateId) {
    checks.push({ key: "template", ok: false, message: "Choose a template before queueing." });
  } else {
    template = await CrmMarketingTemplate.findByPk(templateId);
    checks.push({
      key: "template",
      ok: Boolean(template),
      message: template ? "Template found." : "Template was not found.",
    });
    if (template) {
      checks.push({
        key: "useCase",
        ok: template.useCase !== "transactional",
        message: template.useCase === "transactional"
          ? "Transactional templates cannot be used for marketing campaign sends."
          : "Template is allowed for marketing sends.",
      });
      const compliance = analyzeTemplateCompliance(template);
      checks.push({
        key: "unsubscribe",
        ok: compliance.hasUnsubscribeLink,
        message: compliance.hasUnsubscribeLink
          ? "Unsubscribe link is present."
          : "Add a Footer block or an unsubscribe link before queueing marketing email.",
      });
      checks.push({
        key: "trackingBaseUrl",
        ok: !compliance.usesRuntimeUnsubscribe || compliance.hasRuntimeUrlBase,
        message: compliance.usesRuntimeUnsubscribe && !compliance.hasRuntimeUrlBase
          ? "Set CRM_TRACKING_BASE_URL or CRM_PUBLIC_BASE_URL so unsubscribe links render as full URLs."
          : "Public marketing links can be generated.",
      });
      templateValidation = validateTemplateBeforeSend(template, {
        subject: body.subject || campaign.name,
        recipients,
        data: body.data && typeof body.data === "object" ? body.data : {},
      });
      checks.push(...templateValidation.checks.map((check) => ({
        ...check,
        key: `templateValidation:${check.key}`,
      })));
    }
  }

  checks.push({
    key: "subject",
    ok: Boolean(String(body.subject || campaign.name || "").trim()),
    message: "Subject is present.",
  });
  checks.push({
    key: "recipients",
    ok: recipients.length > 0 && invalid.length === 0,
    message: invalid.length ? "Fix invalid recipient rows." : "Recipients are valid.",
  });
  checks.push({
    key: "batchSize",
    ok: recipients.length <= 500,
    message: recipients.length > 500 ? "Queue at most 500 recipients per request." : "Batch size is within limit.",
  });

  const allowResend = body.allowResend === true;
  const seen = new Set();
  const duplicates = [];
  const suppressed = [];
  const existing = [];
  let uniqueValid = 0;
  for (const recipient of recipients) {
    const key = recipient.email.toLowerCase();
    if (seen.has(key)) {
      duplicates.push({ email: recipient.email });
      continue;
    }
    seen.add(key);
    uniqueValid += 1;
    const suppression = await suppressionService.isSuppressed(campaign.locationId, recipient.email);
    if (suppression) {
      suppressed.push({
        email: recipient.email,
        reason: suppression.reason,
        suppressionId: suppression.id,
      });
      continue;
    }
    if (!allowResend) {
      const existingMessage = await findExistingCampaignRecipient(campaign.id, recipient.email);
      if (existingMessage) {
        existing.push({
          email: recipient.email,
          messageId: existingMessage.id,
          status: existingMessage.status,
        });
      }
    }
  }

  return {
    campaign: serializeCampaign(campaign),
    template: template ? { id: template.id, name: template.name, useCase: template.useCase } : null,
    compliance: template ? analyzeTemplateCompliance(template) : null,
    counts: {
      input: recipientInput.length,
      valid: recipients.length,
      invalid: invalid.length,
      duplicate: duplicates.length,
      suppressed: suppressed.length,
      existing: existing.length,
      queueable: Math.max(0, uniqueValid - suppressed.length - (allowResend ? 0 : existing.length)),
    },
    invalid,
    duplicates,
    suppressed,
    existing,
    allowResend,
    checks,
    templateValidation,
    ok: checks.every((check) => check.ok || check.severity === "warning"),
  };
}

async function queueCampaignMessages(campaignId, body = {}) {
  const { CrmMarketingCampaign, CrmMarketingTemplate } = getModels();
  const campaign = await CrmMarketingCampaign.findByPk(campaignId);
  if (!campaign) throw notFound("Campaign");
  validate([
    campaign.status === "paused" && { field: "status", message: "Resume the campaign before queueing more recipients." },
    campaign.status === "cancelled" && { field: "status", message: "Cancelled campaigns cannot be queued." },
  ]);

  const recipientInput = Array.isArray(body.recipients) ? body.recipients : [];
  const recipients = normalizeRecipients(recipientInput);
  const templateId = body.templateId || campaign.templateId;
  validate([
    !templateId && { field: "templateId", message: "Choose a template before queueing a campaign." },
    recipients.length === 0 && { field: "recipients", message: "At least one recipient is required." },
    recipients.length !== recipientInput.length && { field: "recipients", message: "Every recipient must include a valid email address." },
    recipients.length > 500 && { field: "recipients", message: "Queue at most 500 recipients per request." },
  ]);

  const template = await CrmMarketingTemplate.findByPk(templateId);
  if (!template) throw notFound("Template");
  const compliance = analyzeTemplateCompliance(template);
  const globalData = body.data && typeof body.data === "object" ? body.data : {};
  const templateValidation = validateTemplateBeforeSend(template, {
    subject: body.subject || campaign.name,
    recipients,
    data: globalData,
  });
  validate([
    template.useCase === "transactional" && {
      field: "templateId",
      message: "Transactional templates cannot be used for marketing campaign sends.",
    },
    !compliance.hasUnsubscribeLink && {
      field: "templateId",
      message: "Marketing templates must include an unsubscribe link. Add a Footer block before queueing.",
    },
    compliance.usesRuntimeUnsubscribe && !compliance.hasRuntimeUrlBase && {
      field: "templateId",
      message: "Set CRM_TRACKING_BASE_URL or CRM_PUBLIC_BASE_URL before queueing templates that use {{unsubscribeUrl}}.",
    },
    ...templateValidation.errors.map((issue) => ({
      field: issue.key,
      message: issue.message,
    })),
  ]);

  const queueType = body.queueType === "journey" ? "journey" : "bulk";
  const allowResend = body.allowResend === true;
  const queued = [];
  const suppressed = [];
  const duplicates = [];
  const existing = [];
  const seen = new Set();

  for (const recipient of recipients) {
    const key = recipient.email.toLowerCase();
    if (seen.has(key)) {
      duplicates.push({ email: recipient.email });
      continue;
    }
    seen.add(key);

    const suppression = await suppressionService.isSuppressed(campaign.locationId, recipient.email);
    if (suppression) {
      suppressed.push({
        email: recipient.email,
        reason: suppression.reason,
        suppressionId: suppression.id,
      });
      continue;
    }

    if (!allowResend) {
      const existingMessage = await findExistingCampaignRecipient(campaign.id, recipient.email);
      if (existingMessage) {
        existing.push({
          email: recipient.email,
          messageId: existingMessage.id,
          status: existingMessage.status,
        });
        continue;
      }
    }

    if (queued.length === 0) {
      await campaign.update({
        templateId,
        status: "sending",
        executionDate: campaign.executionDate || new Date(),
      });
    }

    const payload = {
      data: { ...globalData, ...(recipient.data || {}) },
      from: body.from || undefined,
      subject: recipient.subject || body.subject || undefined,
    };
    const message = await marketingMessageRepository.createMessage({
      locationId: campaign.locationId,
      campaignId: campaign.id,
      templateId,
      channel: "email",
      recipient: recipient.email,
      subject: recipient.subject || body.subject || campaign.name,
      payload,
      metadata: {
        queueType,
        source: body.source || "campaign_queue",
      },
    });
    const enqueue = await enqueueMarketingMessage({
      messageId: message.id,
      campaignId: campaign.id,
      channel: "email",
      queueType,
    });
    const updated = await marketingMessageRepository.markQueued(message, enqueue);
    await marketingMessageRepository.createDeliveryEvent({
      messageId: updated.id,
      campaignId: campaign.id,
      eventType: enqueue?.skipped ? "enqueue_skipped" : "queued",
      payload: { source: "campaign_queue", enqueue, queueType },
    });
    queued.push({
      id: updated.id,
      recipient: updated.recipient,
      status: updated.status,
      enqueue,
    });
  }

  if (queued.length) {
    await campaign.increment("totalRecipients", { by: queued.length });
    await campaign.reload();
  }

  return {
    campaign: serializeCampaign(await campaign.reload()),
    queued,
    totalQueued: queued.length,
    suppressed,
    totalSuppressed: suppressed.length,
    duplicates,
    totalDuplicates: duplicates.length,
    existing,
    totalExisting: existing.length,
    allowResend,
    queueType,
  };
}

async function retryCampaignMessage(messageId, body = {}) {
  const { CrmMarketingMessage, CrmMarketingTemplate, CrmMarketingCampaign } = getModels();
  const message = await CrmMarketingMessage.findByPk(messageId);
  if (!message) throw notFound("Marketing message");
  if (message.channel !== "email") {
    validate([{ field: "channel", message: "Only email marketing messages can be retried." }]);
  }
  const retryableStatuses = ["failed", "pending"];
  validate([
    !retryableStatuses.includes(message.status) && {
      field: "status",
      message: `Only ${retryableStatuses.join(" or ")} messages can be retried.`,
    },
  ]);

  const template = message.templateId ? await CrmMarketingTemplate.findByPk(message.templateId) : null;
  if (!template) throw notFound("Template");
  const compliance = analyzeTemplateCompliance(template);
  const retryData = message.payload?.data && typeof message.payload.data === "object" ? message.payload.data : {};
  const templateValidation = validateTemplateBeforeSend(template, {
    subject: message.subject || message.payload?.subject,
    recipients: [{ email: message.recipient, data: retryData }],
    data: retryData,
  });
  validate([
    template.useCase === "transactional" && {
      field: "templateId",
      message: "Transactional templates cannot be retried through marketing queues.",
    },
    !compliance.hasUnsubscribeLink && {
      field: "templateId",
      message: "Marketing templates must include an unsubscribe link before retrying.",
    },
    compliance.usesRuntimeUnsubscribe && !compliance.hasRuntimeUrlBase && {
      field: "templateId",
      message: "Set CRM_TRACKING_BASE_URL or CRM_PUBLIC_BASE_URL before retrying templates that use {{unsubscribeUrl}}.",
    },
    ...templateValidation.errors.map((issue) => ({
      field: issue.key,
      message: issue.message,
    })),
  ]);

  const suppression = await suppressionService.isSuppressed(message.locationId, message.recipient);
  validate([
    suppression && {
      field: "recipient",
      message: `Recipient is suppressed (${suppression.reason}). Release the suppression before retrying.`,
    },
  ]);

  const currentMetadata = message.metadata || {};
  const queueType = body.queueType === "journey" || body.queueType === "bulk"
    ? body.queueType
    : currentMetadata.queueType || "bulk";
  const retryCount = Number(currentMetadata.retryCount || 0) + 1;
  const previousStatus = message.status;
  await message.update({
    status: "pending",
    metadata: {
      ...currentMetadata,
      queueType,
      retryCount,
      lastRetryAt: new Date().toISOString(),
      retryReason: body.reason ? String(body.reason).slice(0, 500) : null,
      lastRetryPreviousStatus: previousStatus,
    },
  });

  const enqueue = await enqueueMarketingMessage({
    messageId: message.id,
    campaignId: message.campaignId,
    channel: "email",
    queueType,
  });
  const updated = await marketingMessageRepository.markQueued(message, enqueue);
  await marketingMessageRepository.createDeliveryEvent({
    messageId: updated.id,
    campaignId: updated.campaignId,
    eventType: enqueue?.skipped ? "retry_enqueue_skipped" : "retry_queued",
    payload: {
      source: "campaign_activity_retry",
      enqueue,
      queueType,
      retryCount,
      previousStatus,
    },
  });

  if (updated.campaignId) {
    const campaign = await CrmMarketingCampaign.findByPk(updated.campaignId);
    if (campaign && campaign.status !== "sending") {
      await campaign.update({
        status: "sending",
        executionDate: campaign.executionDate || new Date(),
      });
    }
  }

  return {
    message: serializeMessage(updated),
    enqueue,
    queueType,
    retryCount,
  };
}

async function retryFailedMessages(body = {}) {
  const loc = requireLocation(body.locationId);
  const { CrmMarketingCampaign, CrmMarketingMessage } = getModels();
  const where = { locationId: loc, status: "failed" };
  const messageIds = Array.isArray(body.messageIds) ? body.messageIds.filter(Boolean) : [];
  if (messageIds.length) where.id = { [Op.in]: messageIds };
  if (body.campaignId) where.campaignId = body.campaignId;

  const candidates = await CrmMarketingMessage.findAll({
    where,
    include: [{ model: CrmMarketingCampaign, as: "campaign", required: false }],
    order: [["updatedAt", "DESC"]],
    limit: Math.min(100, Math.max(1, Number(body.limit) || 100)),
  });
  const filtered = body.failureGroup
    ? candidates.filter((row) => failureGroupKey(messageFailureReason(row)) === body.failureGroup)
    : candidates;

  const retried = [];
  const failed = [];
  for (const row of filtered) {
    try {
      const result = await retryCampaignMessage(row.id, {
        queueType: body.queueType || row.metadata?.queueType || "bulk",
        reason: body.reason || "Bulk retry from failed message inbox",
      });
      retried.push(result.message);
    } catch (err) {
      failed.push({
        id: row.id,
        recipient: row.recipient,
        error: err.message,
      });
    }
  }

  return {
    retried,
    failed,
    totalCandidates: candidates.length,
    totalMatched: filtered.length,
    totalRetried: retried.length,
    totalFailed: failed.length,
  };
}

async function pauseCampaign(id, body = {}) {
  const { CrmMarketingCampaign } = getModels();
  const campaign = await CrmMarketingCampaign.findByPk(id);
  if (!campaign) throw notFound("Campaign");
  validate([
    !["scheduled", "sending"].includes(campaign.status) && {
      field: "status",
      message: "Only scheduled or sending campaigns can be paused.",
    },
  ]);
  await campaign.update({
    status: "paused",
  });
  return {
    campaign: serializeCampaign(campaign),
    action: "paused",
    reason: body.reason || null,
  };
}

async function resumeCampaign(id, body = {}) {
  const { CrmMarketingCampaign } = getModels();
  const campaign = await CrmMarketingCampaign.findByPk(id);
  if (!campaign) throw notFound("Campaign");
  validate([
    campaign.status !== "paused" && {
      field: "status",
      message: "Only paused campaigns can be resumed.",
    },
  ]);
  const nextStatus = campaign.scheduledAt && new Date(campaign.scheduledAt) > new Date() ? "scheduled" : "sending";
  await campaign.update({
    status: nextStatus,
    executionDate: campaign.executionDate || new Date(),
  });
  return {
    campaign: serializeCampaign(campaign),
    action: "resumed",
    reason: body.reason || null,
  };
}

async function cancelCampaign(id, body = {}) {
  const { CrmMarketingCampaign, CrmMarketingMessage } = getModels();
  const campaign = await CrmMarketingCampaign.findByPk(id);
  if (!campaign) throw notFound("Campaign");
  validate([
    ["sent", "cancelled"].includes(campaign.status) && {
      field: "status",
      message: "This campaign can no longer be cancelled.",
    },
  ]);
  const reason = body.reason ? String(body.reason).slice(0, 500) : "Campaign cancelled";
  const cancellableMessages = await CrmMarketingMessage.findAll({
    where: {
      campaignId: campaign.id,
      status: { [Op.in]: ["pending", "queued", "sending"] },
    },
    limit: 1000,
  });
  for (const message of cancellableMessages) {
    await message.update({
      status: "cancelled",
      metadata: {
        ...(message.metadata || {}),
        cancelledAt: new Date().toISOString(),
        cancelReason: reason,
      },
    });
    await marketingMessageRepository.createDeliveryEvent({
      messageId: message.id,
      campaignId: campaign.id,
      eventType: "cancelled",
      payload: {
        source: "campaign_control",
        reason,
      },
    });
  }
  await campaign.update({ status: "cancelled" });
  return {
    campaign: serializeCampaign(campaign),
    action: "cancelled",
    totalCancelled: cancellableMessages.length,
    reason,
  };
}

async function listSuppressions(query = {}) {
  return suppressionService.listSuppressions(query);
}

async function createSuppression(body = {}) {
  return suppressionService.suppressEmail({ ...body, source: body.source || "manual" });
}

async function releaseSuppression(id) {
  return suppressionService.releaseSuppression(id);
}

async function updateCampaign(id, body = {}) {
  const { CrmMarketingCampaign } = getModels();
  const row = await CrmMarketingCampaign.findByPk(id);
  if (!row) throw notFound("Campaign");
  if (body.status && !VALID_CAMPAIGN_STATUSES.includes(body.status)) {
    validate([{ field: "status", message: `Status must be one of: ${VALID_CAMPAIGN_STATUSES.join(", ")}.` }]);
  }
  await row.update({
    name: body.name ?? row.name,
    folderId: body.folderId === null ? null : body.folderId ?? row.folderId,
    templateId: body.templateId === null ? null : body.templateId ?? row.templateId,
    status: body.status ?? row.status,
    scheduledAt: body.scheduledAt === null ? null : body.scheduledAt ?? row.scheduledAt,
  });
  return serializeCampaign(row);
}

async function deleteCampaign(id) {
  const { CrmMarketingCampaign } = getModels();
  const row = await CrmMarketingCampaign.findByPk(id);
  if (!row) throw notFound("Campaign");
  const snapshot = serializeCampaign(row);
  await row.destroy();
  return snapshot;
}

// ── Statistics ──────────────────────────────────────────────────────
//
// Campaign-level aggregation. Reads denormalised counters off the
// campaign row so the Statistics tab is O(N campaigns) rather than
// scanning every event.

function parseRange(query = {}) {
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 7 * 86400000);
  const from = query.from ? new Date(query.from) : defaultFrom;
  const to = query.to ? new Date(query.to) : now;
  if (query.to && /^\d{4}-\d{2}-\d{2}$/.test(query.to)) {
    to.setUTCHours(23, 59, 59, 999);
  }
  return { from, to };
}

async function getStatistics(query = {}) {
  const loc = requireLocation(query.locationId);
  const { CrmMarketingCampaign } = getModels();
  const { from, to } = parseRange(query);

  const where = {
    locationId: loc,
    createdAt: { [Op.between]: [from, to] },
  };
  if (query.campaignType) where.campaignType = query.campaignType;

  const campaigns = await CrmMarketingCampaign.findAll({ where });

  const totals = campaigns.reduce(
    (acc, c) => {
      acc.delivered += c.totalDelivered;
      acc.opened += c.totalOpened;
      acc.clicked += c.totalClicked;
      acc.bounced += c.totalBounced;
      acc.unsubscribed += c.totalUnsubscribed;
      acc.complained += c.totalComplained;
      return acc;
    },
    { delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0, complained: 0 }
  );

  // Engagement summary breakdown by campaign type.
  const byType = { email_campaign: {}, workflow_campaign: {}, bulk_action_campaign: {} };
  for (const c of campaigns) {
    const bucket = byType[c.campaignType] || (byType[c.campaignType] = {});
    bucket.delivered = (bucket.delivered || 0) + c.totalDelivered;
    bucket.opened = (bucket.opened || 0) + c.totalOpened;
    bucket.clicked = (bucket.clicked || 0) + c.totalClicked;
    bucket.unsubscribed = (bucket.unsubscribed || 0) + c.totalUnsubscribed;
  }

  // Open-rate buckets per day for the chart.
  const dayBuckets = new Map();
  for (const c of campaigns) {
    if (!c.executionDate && !c.scheduledAt) continue;
    const day = (c.executionDate || c.scheduledAt).toISOString().slice(0, 10);
    const b = dayBuckets.get(day) || { delivered: 0, opened: 0 };
    b.delivered += c.totalDelivered;
    b.opened += c.totalOpened;
    dayBuckets.set(day, b);
  }
  const openRateSeries = Array.from(dayBuckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, v]) => ({
      day,
      delivered: v.delivered,
      opened: v.opened,
      openRate: v.delivered > 0 ? Math.round((v.opened / v.delivered) * 10000) / 100 : 0,
    }));

  // Top performers by clicks.
  const top = campaigns
    .map(serializeCampaign)
    .filter((c) => c.metrics.delivered > 0)
    .sort((a, b) => (b.metrics.clicked || 0) - (a.metrics.clicked || 0))
    .slice(0, 5);

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    totals,
    byType,
    openRateSeries,
    topPerformers: top,
  };
}

module.exports = {
  getTemplateBuilderCatalog,
  getMergeTagCatalog,
  validateTemplateBeforeSend,
  // folders
  listFolders,
  createFolder,
  deleteFolder,
  // assets
  listAssets,
  createAsset,
  uploadAsset,
  updateAsset,
  deleteAsset,
  // snippets
  listSnippets,
  createSnippet,
  updateSnippet,
  deleteSnippet,
  // templates
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  renderTemplate,
  renderDraftTemplate,
  sendTestTemplate,
  sendTestDraftTemplate,
  listTemplateRevisions,
  getTemplateRevision,
  restoreTemplateRevision,
  // campaigns
  listCampaigns,
  listCampaignMessages,
  listMessageEvents,
  listFailedMessages,
  createCampaign,
  preflightCampaignMessages,
  queueCampaignMessages,
  retryCampaignMessage,
  retryFailedMessages,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  updateCampaign,
  deleteCampaign,
  // suppressions
  listSuppressions,
  createSuppression,
  releaseSuppression,
  // statistics
  getStatistics,
};
