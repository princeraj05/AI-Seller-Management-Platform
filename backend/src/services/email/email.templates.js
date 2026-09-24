export const emailTemplates = {
  welcome: (name) => ({
    subject: 'Welcome to AI Seller Management Platform',
    body: `<h1>Welcome, ${name}!</h1><p>Your seller account is ready to manage omnichannel sales.</p>`,
  }),
  order: (orderNumber) => ({
    subject: `New Order Received: ${orderNumber}`,
    body: `<h2>Order #${orderNumber}</h2><p>You have received a new order across your connected channels.</p>`,
  }),
  lowStock: (sku, stock) => ({
    subject: `Low Stock Alert for ${sku}`,
    body: `<h2>Inventory Alert</h2><p>SKU ${sku} currently has ${stock} units remaining.</p>`,
  }),
};
