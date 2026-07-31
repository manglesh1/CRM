const test = require("node:test");
const assert = require("node:assert/strict");

const { STATUS } = require("../src/modules/transactional/constants");
const { _internal } = require("../src/modules/transactional/service");

test("pending and queue-error messages are recoverable after production SQS failures", () => {
  assert.equal(_internal.shouldRecoverMessage({ status: STATUS.PENDING }), true);
  assert.equal(
    _internal.shouldRecoverMessage({
      status: STATUS.ENQUEUE_SKIPPED,
      lastError: "queue_error:AccessDeniedException",
    }),
    true
  );
  assert.equal(
    _internal.shouldRecoverMessage({ status: STATUS.QUEUED, lastError: null }),
    false
  );
});

test("queue errors become an actionable service response", () => {
  const error = _internal.queueUnavailableError({ name: "AccessDeniedException" });
  assert.equal(error.statusCode, 503);
  assert.equal(error.code, "transactional_queue_unavailable");
  assert.match(error.message, /EC2 IAM role and SQS queue configuration/);
});
