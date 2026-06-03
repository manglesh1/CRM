module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("crm_queue_jobs", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      locationId: { type: Sequelize.INTEGER, allowNull: true },
      queueName: {
        type: Sequelize.STRING(60),
        allowNull: false,
        defaultValue: "general",
      },
      jobType: { type: Sequelize.STRING(80), allowNull: false },
      status: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "pending",
      },
      priority: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 50,
      },
      payload: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      result: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      attempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      maxAttempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 3,
      },
      runAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      lockedAt: { type: Sequelize.DATE, allowNull: true },
      lockedBy: { type: Sequelize.STRING(160), allowNull: true },
      startedAt: { type: Sequelize.DATE, allowNull: true },
      completedAt: { type: Sequelize.DATE, allowNull: true },
      lastError: { type: Sequelize.TEXT, allowNull: true },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    await queryInterface.addIndex("crm_queue_jobs", ["queueName", "status", "runAt", "priority"], {
      name: "crm_queue_jobs_ready_idx",
    });
    await queryInterface.addIndex("crm_queue_jobs", ["locationId", "queueName", "jobType", "createdAt"], {
      name: "crm_queue_jobs_location_type_created_idx",
    });
    await queryInterface.addIndex("crm_queue_jobs", ["lockedBy", "lockedAt"], {
      name: "crm_queue_jobs_lock_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_queue_jobs");
  },
};
