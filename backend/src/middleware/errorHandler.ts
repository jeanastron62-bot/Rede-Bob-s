import { Request, Response, NextFunction } from 'express';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err);

  if (err.name === 'ZodError') {
    return res.status(400).json({ error: 'Erro de validação', details: err.errors });
  }

  const status = err.status || 500;
  const message = err.message || 'Erro interno do servidor';

  res.status(status).json({ error: message });
};
