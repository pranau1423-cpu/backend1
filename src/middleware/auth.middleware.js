import { verifyAccess } from "../utils/token.js";
import ExpressError from "../utils/ExpressError.js";

export const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ExpressError(401, "No token provided");
    }

    const token = authHeader.split(" ")[1];
    const payload = verifyAccess(token);
    
    req.user = {
      id: payload.sub,
      role: payload.role
    };
    
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ 
        error: "Token expired",
        code: "TOKEN_EXPIRED"
      });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ 
        error: "Invalid token",
        code: "INVALID_TOKEN"
      });
    }
    next(err);
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: "Forbidden",
        message: `Required role: ${roles.join(" or ")}`
      });
    }
    
    next();
  };
};

// Optional middleware - doesn't fail if no token
export const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const payload = verifyAccess(token);
      req.user = {
        id: payload.sub,
        role: payload.role
      };
    }
  } catch (err) {
    // Silently fail - user will be undefined
  }
  next();
};
