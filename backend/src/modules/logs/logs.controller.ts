import { Request, Response, NextFunction } from 'express';
import { logsService } from './logs.service';

// Escapa uma célula CSV: envolve em aspas e duplica aspas internas.
// Necessário para qualquer valor que possa conter vírgula, aspas ou quebra de linha.
const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
};

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const logs = await logsService.listLogs(req.query);
    res.json(logs);
  } catch (error) {
    next(error);
  }
};

export const exportLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const logs = await logsService.exportLogs(req.query);

    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=logs.csv');

      const header = 'ID,Data,Usuário,Ação,Detalhes\n';
      const rows = logs.map(l => {
        const details = l.details ? JSON.stringify(l.details) : '';
        return [
          csvCell(l.id),
          csvCell(l.createdAt.toISOString()),
          csvCell(l.username),
          csvCell(l.action),
          csvCell(details),
        ].join(',');
      }).join('\n');

      return res.send(header + rows);
    }

    res.json(logs);
  } catch (error) {
    next(error);
  }
};
