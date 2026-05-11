const DEFAULT_DESIGN = {
  schemaVersion: 1,
  settings: {
    contentWidth: 600,
    backgroundColor: "#EAF0F6",
    bodyColor: "#ffffff",
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: 16,
    textColor: "#111827",
    linkColor: "#000000",
    buttonColor: "#2196F3",
    dividerColor: "#FED7E2",
  },
  sections: [
    {
      id: "sec_intro",
      type: "section",
      layout: "1",
      settings: {
        backgroundColor: "#ffffff",
        padding: { top: 20, right: 24, bottom: 20, left: 24 },
        mobileStack: true,
      },
      columns: [
        {
          id: "col_intro",
          width: "100%",
          blocks: [
            {
              id: "blk_view_browser",
              type: "text",
              content: '<a href="{{viewInBrowserUrl}}">View this email in browser</a>',
              settings: { align: "center", fontSize: 14, color: "#111827" },
            },
            {
              id: "blk_heading",
              type: "heading",
              content: "Start from scratch",
              settings: { align: "center", fontSize: 32, fontWeight: 700, color: "#000000" },
            },
            {
              id: "blk_divider",
              type: "divider",
              settings: { height: 2, color: "#FED7E2", padding: { top: 12, bottom: 0 } },
            },
          ],
        },
      ],
    },
    {
      id: "sec_footer",
      type: "section",
      layout: "1",
      settings: {
        backgroundColor: "#ffffff",
        padding: { top: 14, right: 24, bottom: 24, left: 24 },
        mobileStack: true,
      },
      columns: [
        {
          id: "col_footer",
          width: "100%",
          blocks: [
            {
              id: "blk_footer",
              type: "footer",
              content: '{{business.name}}<br>{{business.address}}<br><a href="{{unsubscribeUrl}}">Unsubscribe</a>',
              settings: { align: "center", fontSize: 12, color: "#6B7280" },
            },
          ],
        },
      ],
    },
  ],
};

function createDefaultDesign(overrides = {}) {
  return {
    ...DEFAULT_DESIGN,
    settings: {
      ...DEFAULT_DESIGN.settings,
      ...(overrides.settings || {}),
    },
    sections: overrides.sections || DEFAULT_DESIGN.sections,
  };
}

module.exports = {
  DEFAULT_DESIGN,
  createDefaultDesign,
};
