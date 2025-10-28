import dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({
  path: resolve(process.cwd(), ".env"),
});

// Validate required environment variables
const requiredEnvVars = [
  'MONGO_URI',
  'ACCESS_TOKEN_SECRET',
  'REFRESH_TOKEN_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'GEMINI_API_KEY'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingEnvVars.forEach(envVar => console.error(`  - ${envVar}`));
  process.exit(1);
}

// Export configuration object
export const config = {
  port: process.env.PORT || 8080,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  
  mongodb: {
    uri: process.env.MONGO_URI
  },
  
  jwt: {
    accessSecret: process.env.ACCESS_TOKEN_SECRET,
    refreshSecret: process.env.REFRESH_TOKEN_SECRET,
    accessExpiry: process.env.ACCESS_TOKEN_EXP || '15m',
    refreshExpiry: process.env.REFRESH_TOKEN_EXP || '30d'
  },
  
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET
  },
  
  gemini: {
    apiKey: process.env.GEMINI_API_KEY
  }
};

console.log('✅ Configuration loaded successfully');