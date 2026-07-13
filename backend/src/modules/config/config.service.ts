import { prisma } from '../../config/prisma';
import { createLog } from '../../utils/logger';
import { JwtPayload } from '../../middleware/auth';

export const getConfig = async () => {
  let conf = await prisma.systemConfig.findUnique({ where: { id: 1 } });
  if (!conf) {
    // se não existir, cria com os defaults
    conf = await prisma.systemConfig.create({
      data: { updatedBy: 'system', contactPhone: '', contactInstagram: '' }
    });
  }
  return conf;
};

export const updateConfig = async (data: any, user: JwtPayload) => {
  return await prisma.$transaction(async (tx) => {
    const conf = await tx.systemConfig.upsert({
      where: { id: 1 },
      update: {
        ...data,
        updatedBy: user.username
      },
      create: {
        ...data,
        updatedBy: user.username
      }
    });

    await createLog(tx, {
      userId: user.userId,
      username: user.username,
      action: 'CONFIG_UPDATED',
      details: data
    });

    return conf;
  });
};
