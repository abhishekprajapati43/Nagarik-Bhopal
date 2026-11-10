/** Run a parser over the request body or query string before the controller. */
export const validatedBody = (parser) => (req, _res, next) => {
  try {
    req.validated = parser(req.body || {});
    next();
  } catch (error) {
    next(error);
  }
};

export const validatedQuery = (parser) => (req, _res, next) => {
  try {
    req.filters = parser(req.query || {});
    next();
  } catch (error) {
    next(error);
  }
};
