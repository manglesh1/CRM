const express = require("express");
const emailRoutes = require("./email/routes");
const triggerLinksRoutes = require("./triggerLinks/routes");
const calendarRoutes = require("./calendar/routes");

const router = express.Router();

router.get("/overview", (_req, res) => {
  res.json({
    success: true,
    data: {
      domain: "marketing",
      futureFrontend: "movira-crm frontend",
      queues: ["marketing-bulk", "marketing-journey"],
      status: "design-scaffold",
    },
  });
});

router.use("/email", emailRoutes);
router.use("/trigger-links", triggerLinksRoutes);
router.use("/calendar", calendarRoutes);

module.exports = router;
