const { BLOCK_CATALOG, LAYOUT_CATALOG } = require("./catalog");

const blockTypes = new Set(BLOCK_CATALOG.map((block) => block.type));
const layouts = new Set(LAYOUT_CATALOG.map((layout) => layout.type));

function validationError(errors) {
  const err = new Error(errors[0]?.message || "Invalid email design");
  err.statusCode = 400;
  err.errors = errors;
  return err;
}

function validateDesign(design) {
  const errors = [];
  if (!design || typeof design !== "object" || Array.isArray(design)) {
    errors.push({ field: "designJson", message: "Design JSON must be an object." });
    throw validationError(errors);
  }

  if (design.schemaVersion !== 1) {
    errors.push({ field: "schemaVersion", message: "Only email builder schemaVersion 1 is supported." });
  }

  if (design.settings && typeof design.settings !== "object") {
    errors.push({ field: "settings", message: "Settings must be an object." });
  }

  if (!Array.isArray(design.sections)) {
    errors.push({ field: "sections", message: "Design must include a sections array." });
  } else {
    design.sections.forEach((section, sectionIndex) => {
      if (!section?.id) {
        errors.push({ field: `sections.${sectionIndex}.id`, message: "Section id is required." });
      }
      if (section.layout && !layouts.has(section.layout)) {
        errors.push({ field: `sections.${sectionIndex}.layout`, message: "Unsupported section layout." });
      }
      if (!Array.isArray(section.columns) || section.columns.length < 1) {
        errors.push({ field: `sections.${sectionIndex}.columns`, message: "Section must have at least one column." });
        return;
      }
      section.columns.forEach((column, columnIndex) => {
        if (!column?.id) {
          errors.push({
            field: `sections.${sectionIndex}.columns.${columnIndex}.id`,
            message: "Column id is required.",
          });
        }
        if (!Array.isArray(column.blocks)) {
          errors.push({
            field: `sections.${sectionIndex}.columns.${columnIndex}.blocks`,
            message: "Column blocks must be an array.",
          });
          return;
        }
        column.blocks.forEach((block, blockIndex) => {
          const field = `sections.${sectionIndex}.columns.${columnIndex}.blocks.${blockIndex}`;
          if (!block?.id) {
            errors.push({ field: `${field}.id`, message: "Block id is required." });
          }
          if (!block?.type || !blockTypes.has(block.type)) {
            errors.push({ field: `${field}.type`, message: "Unsupported block type." });
          }
        });
      });
    });
  }

  if (errors.length) throw validationError(errors);
  return true;
}

module.exports = {
  validateDesign,
};
