import { api } from './api.js';

const IMAGE_MAX_SOURCE = 15 * 1024 * 1024;
const VIDEO_MAX_SOURCE = 50 * 1024 * 1024;
const VIDEO_MAX_SECONDS = 90;

function bytesLabel(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

async function compressImage(file) {
  if (file.size > IMAGE_MAX_SOURCE) {
    throw new Error(`Image trop volumineuse (${bytesLabel(file.size)}). Maximum avant optimisation : 15 Mo.`);
  }
  if (!('createImageBitmap' in window)) return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
    if (!blob || blob.size >= file.size) return file;
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'dunu-image';
    return new File([blob], `${baseName}.webp`, { type: 'image/webp', lastModified: Date.now() });
  } catch {
    // Cloudinary applique aussi une transformation entrante avant stockage.
    return file;
  } finally {
    bitmap?.close?.();
  }
}

async function readVideoDuration(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => resolve(video.duration);
      video.onerror = () => reject(new Error('Impossible de lire cette vidéo.'));
      video.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadDunuMedia(file, type = 'image', onProgress = () => {}) {
  if (!file) throw new Error('Sélectionnez un fichier.');
  const isImage = type === 'image';
  const allowed = isImage
    ? ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
    : ['video/mp4', 'video/webm', 'video/quicktime'];
  if (!allowed.includes(file.type)) {
    throw new Error(isImage ? 'Formats acceptés : JPG, PNG, WebP ou AVIF.' : 'Formats vidéo acceptés : MP4, WebM ou MOV.');
  }

  let uploadFile = file;
  if (isImage) {
    onProgress('Optimisation de la photo sur votre appareil…');
    uploadFile = await compressImage(file);
  } else {
    if (file.size > VIDEO_MAX_SOURCE) throw new Error('Vidéo trop volumineuse. Maximum : 50 Mo.');
    onProgress('Vérification de la durée de la vidéo…');
    const duration = await readVideoDuration(file);
    if (!Number.isFinite(duration) || duration > VIDEO_MAX_SECONDS) {
      throw new Error('La vidéo doit durer 90 secondes maximum.');
    }
  }

  onProgress(`Envoi du média optimisé (${bytesLabel(uploadFile.size)})…`);
  const signature = await api(`/catalog/upload-signature?resourceType=${type}`);
  const body = new FormData();
  body.append('file', uploadFile);
  body.append('api_key', signature.apiKey);
  body.append('timestamp', String(signature.timestamp));
  body.append('folder', signature.folder);
  body.append('transformation', signature.transformation);
  body.append('signature', signature.signature);

  const endpoint = `https://api.cloudinary.com/v1_1/${signature.cloudName}/${type}/upload`;
  let response; try { response = await fetch(endpoint, { method: 'POST', body }); } catch { throw new Error('Connexion à Cloudinary bloquée. Vérifiez la politique de sécurité du navigateur et les paramètres Render.'); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error?.message || 'Téléversement impossible. Vérifiez la configuration Cloudinary.');

  const deliveryTransform = isImage
    ? 'f_auto,q_auto:good,w_1200,c_limit'
    : 'q_auto:good,w_1280,c_limit';
  const url = result.secure_url.replace('/upload/', `/upload/${deliveryTransform}/`);
  return {
    url,
    bytesBefore: file.size,
    bytesUploaded: uploadFile.size,
    resourceType: type,
    publicId: result.public_id
  };
}


export async function uploadDunuAdMedia(file,type='image',onProgress=()=>{}){
  if(!file)throw new Error('Sélectionnez un fichier.');
  const image=type==='image';
  const ext=(file.name||'').split('.').pop().toLowerCase();
  const imageTypes=['image/jpeg','image/png','image/webp','image/avif'];
  const videoTypes=['video/mp4','video/webm','video/quicktime'];
  const imageExt=['jpg','jpeg','png','webp','avif'];
  const videoExt=['mp4','webm','mov'];
  // Certains navigateurs Windows transmettent un MIME vide : l'extension sert alors de secours.
  if(image?(!imageTypes.includes(file.type)&&!imageExt.includes(ext)):(!videoTypes.includes(file.type)&&!videoExt.includes(ext))){
    throw new Error(image?'Formats acceptés : JPG, PNG, WebP ou AVIF.':'Formats acceptés : MP4, WebM ou MOV.');
  }
  let uploadFile=file;
  if(image)uploadFile=await compressImage(file);
  else{
    if(file.size>VIDEO_MAX_SOURCE)throw new Error('Vidéo trop volumineuse. Maximum : 50 Mo.');
    const duration=await readVideoDuration(file);
    if(!Number.isFinite(duration)||duration>VIDEO_MAX_SECONDS)throw new Error('Vidéo limitée à 90 secondes.');
  }
  onProgress(`Envoi de la publicité (${bytesLabel(uploadFile.size)})…`);
  const sig=await api(`/ads/upload-signature?resourceType=${type}`);
  if(!sig?.cloudName||!sig?.apiKey||!sig?.signature||!sig?.timestamp||!sig?.folder)throw new Error('La signature Cloudinary est incomplète. Vérifiez les variables CLOUDINARY_* sur Render.');
  const body=new FormData();
  body.append('file',uploadFile);
  body.append('api_key',sig.apiKey);
  body.append('timestamp',String(sig.timestamp));
  body.append('folder',sig.folder);
  body.append('transformation',sig.transformation);
  body.append('signature',sig.signature);
  let response;
  try{response=await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/${type}/upload`,{method:'POST',body})}
  catch{throw new Error('Connexion à Cloudinary impossible. Vérifiez les autorisations réseau et la configuration Render.')}
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error?.message||'Téléversement publicitaire impossible.');
  if(!result.secure_url||!result.public_id)throw new Error('Cloudinary n’a pas confirmé l’enregistrement du média.');
  const transform=image?'f_auto,q_auto:good,w_1400,c_limit':'q_auto:good,w_1280,c_limit';
  return{url:result.secure_url.replace('/upload/',`/upload/${transform}/`),publicId:result.public_id,type};
}
