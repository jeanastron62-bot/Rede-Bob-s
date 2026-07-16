import { prisma } from './src/config/prisma';
async function main() {
  const order = await prisma.order.findUnique({ where: { id: 20 } });
  console.log(JSON.stringify(order, null, 2));
}
main().finally(() => prisma.$disconnect());
