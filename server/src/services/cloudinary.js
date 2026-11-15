import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config.js';

export function cloudinaryConfigured() {
  return Boolean(config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret);
}

export function uploadSignature(resourceType = 'image') {
  if (!['image', 'video'].includes(resourceType)) throw new Error('Type de média non autorisé');
  if (!cloudinaryConfigured()) throw new Error('Cloudinary non configuré');

  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true
  });

  // Incoming transformations : Cloudinary réduit le média AVANT son stockage.
  // L'original volumineux n'est donc pas conservé comme ressource principale.
  const folder = resourceType === 'image' ? 'dunu/menu-images' : 'dunu/menu-videos';
  const transformation = resourceType === 'image'
    ? 'w_1600,h_1600,c_limit,q_auto:good'
    : 'w_1280,h_720,c_limit,q_auto:good';
  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = { timestamp, folder, transformation };
  const signature = cloudinary.utils.api_sign_request(paramsToSign, config.cloudinary.apiSecret);

  return {
    timestamp,
    signature,
    cloudName: config.cloudinary.cloudName,
    apiKey: config.cloudinary.apiKey,
    folder,
    transformation,
    resourceType,
    maxBytes: resourceType === 'image' ? 20 * 1024 * 1024 : 50 * 1024 * 1024
  };
}
