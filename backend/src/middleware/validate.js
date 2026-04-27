function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!result.success) {
      return res.status(400).json({
        message: "Datos no validos",
        errors: result.error.flatten(),
      });
    }

    req.validated = result.data;
    return next();
  };
}

module.exports = { validate };
