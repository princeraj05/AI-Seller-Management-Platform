export const parseDateRange = (query = {}) => {
  const range = (query.range || '30d').toLowerCase();
  const now = new Date();
  let startDate = new Date();
  let endDate = now;

  if (range === 'today') {
    startDate.setHours(0, 0, 0, 0);
  } else if (range === '7d') {
    startDate.setDate(now.getDate() - 7);
  } else if (range === '90d') {
    startDate.setDate(now.getDate() - 90);
  } else if (range === 'custom' && query.startDate && query.endDate) {
    startDate = new Date(query.startDate);
    endDate = new Date(query.endDate);
  } else {
    // Default 30d
    startDate.setDate(now.getDate() - 30);
  }

  return { startDate, endDate, range };
};
