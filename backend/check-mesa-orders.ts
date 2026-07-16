import { prisma } from './src/config/prisma';
async function main() {
  const orders = await prisma.order.findMany({
    where: { type: 'MESA' },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, status: true, requiresStaffConfirmation: true, clientOnline: true, createdAt: true }
  });
  console.log(JSON.stringify(orders, null, 2));
}
main().finally(() => prisma.$disconnect());
