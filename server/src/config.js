import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 10000),
  mongo: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  clientOrigin: process.env.CLIENT_ORIGIN || '*',
  appUrl: process.env.APP_URL || process.env.CLIENT_ORIGIN || 'https://dunubenin.com',
  resendApiKey: process.env.RESEND_API_KEY,
  mailFrom: process.env.MAIL_FROM || 'DUNU BENIN <no-reply@dunubenin.com>',
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
  adminName: process.env.ADMIN_NAME,
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET
  },
  feexpay: {
    apiKey: process.env.FEEXPAY_API_KEY,
    shopId: process.env.FEEXPAY_SHOP_ID,
    webhookSecret: process.env.FEEXPAY_WEBHOOK_SECRET,
    baseUrl: 'https://api-v2.feexpay.me'
  }
};

if (process.env.NODE_ENV === 'production') {
  if (!config.jwtSecret || config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET doit contenir au moins 32 caractères en production');
  }
  if (config.clientOrigin === '*') {
    throw new Error('CLIENT_ORIGIN doit être défini explicitement en production');
  }
}
