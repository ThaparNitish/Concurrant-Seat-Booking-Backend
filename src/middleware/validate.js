/**
 * Request Validation Middleware using Joi
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, {
      abortEarly: false,     // Return all validation failures, not just the first one
      allowUnknown: true,    // Allow headers or other keys not in strict body validation
    });

    if (error) {
      const details = error.details.map((d) => d.message);
      return res.status(400).json({
        error: 'Validation Error',
        details,
      });
    }

    next();
  };
};

export default validate;
