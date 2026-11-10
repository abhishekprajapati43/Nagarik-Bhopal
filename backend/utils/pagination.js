export const pagination = (query = {}, defaultLimit = 12) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));

  return { page, limit, offset: (page - 1) * limit };
};

export const pageMeta = (total, page, limit) => ({
  total,
  page,
  pages: Math.max(1, Math.ceil(total / limit)),
  limit,
});

export default pagination;
