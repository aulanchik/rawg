import { Request, Response } from 'express';

export const getSample = (req: Request, res: Response) => {
  res.json({ message: 'This is a sample endpoint.' });
};
