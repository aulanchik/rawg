import { NextFunction, Request, Response } from 'express';

interface Error {
  status?: number;
  message?: string;
}

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  const statusCode = err.status || 500;
  const message = err.message || 'Internal Server Error';
  res.status(statusCode).json({
    error: {
      status: statusCode,
      message,
    },
  });
};
