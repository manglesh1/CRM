const { Op } = require("sequelize");
const { getModels } = require("../../db/models");

async function findActiveBinding({ eventType, channel, locationId }) {
  const { CrmEventTemplateBinding } = getModels();

  if (locationId !== null && locationId !== undefined) {
    const specific = await CrmEventTemplateBinding.findOne({
      where: { eventType, channel, locationId, isActive: true },
    });
    if (specific) return specific;
  }

  return CrmEventTemplateBinding.findOne({
    where: {
      eventType,
      channel,
      locationId: { [Op.is]: null },
      isActive: true,
    },
  });
}

async function listBindings({ eventType, channel, locationId, includeInactive = false } = {}) {
  const { CrmEventTemplateBinding } = getModels();
  const where = {};
  if (eventType) where.eventType = eventType;
  if (channel) where.channel = channel;
  if (locationId !== undefined) {
    where.locationId = locationId === null ? { [Op.is]: null } : { [Op.or]: [locationId, { [Op.is]: null }] };
  }
  if (!includeInactive) where.isActive = true;

  return CrmEventTemplateBinding.findAll({
    where,
    order: [
      ["eventType", "ASC"],
      ["channel", "ASC"],
      ["locationId", "ASC"],
    ],
  });
}

async function findBindingById(id) {
  const { CrmEventTemplateBinding } = getModels();
  return CrmEventTemplateBinding.findByPk(id);
}

async function createBinding(data) {
  const { CrmEventTemplateBinding } = getModels();
  return CrmEventTemplateBinding.create(data);
}

async function updateBinding(binding, data) {
  return binding.update(data);
}

async function deleteBinding(binding) {
  return binding.destroy();
}

module.exports = {
  findActiveBinding,
  listBindings,
  findBindingById,
  createBinding,
  updateBinding,
  deleteBinding,
};
