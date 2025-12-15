import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';

export interface JwtPayload {
  username: string;
}

/**
 * 生成 JWT Token
 */
export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, ENV.JWT_SECRET, {
    expiresIn: ENV.JWT_EXPIRES_IN,
  });
}

/**
 * 验证 JWT Token
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET) as JwtPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}
