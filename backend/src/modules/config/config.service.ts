import { prisma } from '../../config/prisma';
import { createLog } from '../../utils/logger';
import { JwtPayload } from '../../middleware/auth';

export const getConfig = async () => {
  return prisma.systemConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { updatedBy: 'system', contactPhone: '', contactInstagram: '' }
  });
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
