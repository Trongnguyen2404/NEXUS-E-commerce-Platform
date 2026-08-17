/**
 * Email bodies. Kept as plain template strings rather than a templating engine
 * so nothing extra has to be copied into the Docker image at build time.
 *
 * Every message ships both HTML and a text fallback — a text/plain part is what
 * keeps a transactional email out of the spam folder.
 */

/** Escapes user-supplied values. Product names and addresses are user input. */
const esc = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const money = (amount: number) => `$${Number(amount).toFixed(2)}`;

const layout = (heading: string, body: string) => `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;">
            <tr>
              <td style="padding:36px 40px 0;">
                <div style="font-size:24px;font-weight:800;letter-spacing:-0.5px;color:#000;">NEXUS<span style="color:#2f6bff;">.</span></div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 40px 8px;">
                <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:800;color:#000;">${heading}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 40px 40px;font-size:15px;line-height:1.6;color:#3c3c43;">
                ${body}
              </td>
            </tr>
          </table>
          <p style="max-width:560px;margin:24px auto 0;font-size:12px;line-height:1.6;color:#8e8e93;text-align:center;">
            This is an automated message from NEXUS. Please do not reply to it.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const button = (href: string, label: string) => `
  <a href="${href}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:15px 30px;border-radius:14px;font-size:13px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;">
    ${label}
  </a>`;

export const passwordResetEmail = (resetUrl: string, expiryMinutes: number) => ({
  subject: 'Reset your NEXUS password',
  html: layout(
    'Reset your password',
    `<p style="margin:0 0 20px;">We received a request to reset the password for your NEXUS account.</p>
     <p style="margin:0 0 28px;">This link expires in <strong>${expiryMinutes} minutes</strong> and can only be used once.</p>
     <p style="margin:0 0 28px;">${button(resetUrl, 'Choose a new password')}</p>
     <p style="margin:0 0 8px;font-size:13px;color:#8e8e93;">If the button does not work, paste this into your browser:</p>
     <p style="margin:0 0 28px;font-size:13px;word-break:break-all;"><a href="${resetUrl}" style="color:#2f6bff;">${resetUrl}</a></p>
     <p style="margin:0;padding-top:24px;border-top:1px solid #f0f0f2;font-size:13px;color:#8e8e93;">
       Didn't request this? You can ignore this email — your password stays unchanged.
     </p>`,
  ),
  text: [
    'Reset your NEXUS password',
    '',
    'We received a request to reset the password for your NEXUS account.',
    `This link expires in ${expiryMinutes} minutes and can only be used once.`,
    '',
    resetUrl,
    '',
    "Didn't request this? You can ignore this email — your password stays unchanged.",
  ].join('\n'),
});

interface OrderEmailItem {
  productName: string;
  /** e.g. "M / Black". Null for products without variants. */
  variantLabel?: string | null;
  quantity: number;
  price: number;
}

export const orderConfirmationEmail = (order: {
  orderNumber: string;
  items: OrderEmailItem[];
  total: number;
  shippingAddress: string;
  orderUrl: string;
}) => {
  const rows = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 0;font-size:14px;color:#000;">
          ${esc(item.productName)}
          ${item.variantLabel ? `<span style="color:#8e8e93;"> · ${esc(item.variantLabel)}</span>` : ''}
          <span style="color:#8e8e93;"> x${item.quantity}</span>
        </td>
        <td style="padding:10px 0;font-size:14px;color:#000;text-align:right;white-space:nowrap;">
          ${money(item.price * item.quantity)}
        </td>
      </tr>`,
    )
    .join('');

  return {
    subject: `Order ${order.orderNumber} confirmed`,
    html: layout(
      'Thanks for your order',
      `<p style="margin:0 0 24px;">Your payment went through and we are preparing your order.</p>
       <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#8e8e93;">Order number</p>
       <p style="margin:0 0 28px;font-size:16px;font-weight:700;color:#000;">${esc(order.orderNumber)}</p>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f0f0f2;border-bottom:1px solid #f0f0f2;margin-bottom:20px;">
         ${rows}
       </table>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
         <tr>
           <td style="font-size:16px;font-weight:800;color:#000;">Total</td>
           <td style="font-size:16px;font-weight:800;color:#000;text-align:right;">${money(order.total)}</td>
         </tr>
       </table>
       <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#8e8e93;">Shipping to</p>
       <p style="margin:0 0 28px;font-size:14px;color:#3c3c43;">${esc(order.shippingAddress)}</p>
       <p style="margin:0;">${button(order.orderUrl, 'View your order')}</p>`,
    ),
    text: [
      `Order ${order.orderNumber} confirmed`,
      '',
      'Your payment went through and we are preparing your order.',
      '',
      ...order.items.map(
        (i) =>
          `  ${i.productName}${i.variantLabel ? ` · ${i.variantLabel}` : ''} x${i.quantity} — ${money(i.price * i.quantity)}`,
      ),
      '',
      `Total: ${money(order.total)}`,
      `Shipping to: ${order.shippingAddress}`,
      '',
      order.orderUrl,
    ].join('\n'),
  };
};

export const refundIssuedEmail = (refund: {
  orderNumber: string;
  amount: number;
  isFullRefund: boolean;
  orderUrl: string;
}) => ({
  subject: `Refund issued for order ${refund.orderNumber}`,
  html: layout(
    refund.isFullRefund ? 'Your refund is on its way' : 'A partial refund is on its way',
    `<p style="margin:0 0 24px;">We have sent <strong>${money(refund.amount)}</strong> back to your original payment method.</p>
     <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#8e8e93;">Order number</p>
     <p style="margin:0 0 28px;font-size:16px;font-weight:700;color:#000;">${esc(refund.orderNumber)}</p>
     ${refund.isFullRefund ? '<p style="margin:0 0 28px;">This order has been cancelled.</p>' : ''}
     <p style="margin:0 0 28px;">Banks usually take 5–10 business days to show the credit.</p>
     <p style="margin:0;">${button(refund.orderUrl, 'View your order')}</p>`,
  ),
  text: [
    refund.isFullRefund ? 'Your refund is on its way' : 'A partial refund is on its way',
    '',
    `We have sent ${money(refund.amount)} back to your original payment method.`,
    `Order number: ${refund.orderNumber}`,
    refund.isFullRefund ? 'This order has been cancelled.' : '',
    'Banks usually take 5-10 business days to show the credit.',
    '',
    refund.orderUrl,
  ]
    .filter(Boolean)
    .join('\n'),
});

const STATUS_COPY: Record<string, { heading: string; body: string }> = {
  PROCESSING: {
    heading: 'Your order is being prepared',
    body: 'We are picking and packing your items now.',
  },
  SHIPPED: {
    heading: 'Your order is on its way',
    body: 'Your parcel has left our warehouse and is heading to you.',
  },
  DELIVERED: {
    heading: 'Your order has been delivered',
    body: 'Your parcel has arrived. We hope you enjoy it.',
  },
  CANCELLED: {
    heading: 'Your order was cancelled',
    body: 'This order has been cancelled. Any payment taken will be refunded.',
  },
};

export const orderStatusEmail = (order: {
  orderNumber: string;
  status: string;
  orderUrl: string;
}) => {
  const copy = STATUS_COPY[order.status] ?? {
    heading: 'Your order was updated',
    body: `The status of your order is now ${order.status}.`,
  };

  return {
    subject: `Order ${order.orderNumber}: ${copy.heading.toLowerCase()}`,
    html: layout(
      copy.heading,
      `<p style="margin:0 0 24px;">${copy.body}</p>
       <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#8e8e93;">Order number</p>
       <p style="margin:0 0 28px;font-size:16px;font-weight:700;color:#000;">${esc(order.orderNumber)}</p>
       <p style="margin:0;">${button(order.orderUrl, 'View your order')}</p>`,
    ),
    text: [
      copy.heading,
      '',
      copy.body,
      '',
      `Order number: ${order.orderNumber}`,
      order.orderUrl,
    ].join('\n'),
  };
};
