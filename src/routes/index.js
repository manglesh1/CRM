const express = require("express");
const transactionalRoutes = require("../modules/transactional/routes");
const marketingRoutes = require("../modules/marketing/routes");
const webhookRoutes = require("../modules/webhooks/routes");
const settingsRoutes = require("../modules/settings/routes");
const notificationsRoutes = require("../modules/notifications/routes");

const router = express.Router();

router.use("/transactional", transactionalRoutes);
router.use("/marketing", marketingRoutes);
router.use("/settings", settingsRoutes);
router.use("/webhooks", webhookRoutes);
router.use("/notifications", notificationsRoutes);

module.exports = router;
