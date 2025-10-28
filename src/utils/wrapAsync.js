/**
 * Wrapper for async route handlers to catch errors
 * Eliminates the need for try-catch blocks in every controller
 * 
 * Usage:
 * router.get('/path', wrapAsync(async (req, res) => {
 *   // Your async code here
 *   const data = await someAsyncOperation();
 *   res.json(data);
 * }));
 */
export const wrapAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Alternative version that explicitly handles the promise
 */
export const asyncHandler = (fn) => {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
};

export default wrapAsync;