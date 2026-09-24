export const validateTrendQuery = (query = {}) => {
  return {
    trendType: query.type ? query.type.toUpperCase() : null,
  };
};
