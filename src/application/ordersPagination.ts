export interface OrdersPageQuery {
  page?: number;
  limit?: number;
}

export interface PaginatedOrders<T> {
  items: T[];
  total: number;
}

export function paginateOrders<T>(orders: T[], query?: OrdersPageQuery): T[] | PaginatedOrders<T> {
  if (!query || query.page === undefined || query.limit === undefined) {
    return orders;
  }
  const start = (query.page - 1) * query.limit;
  return {
    items: orders.slice(start, start + query.limit),
    total: orders.length,
  };
}
