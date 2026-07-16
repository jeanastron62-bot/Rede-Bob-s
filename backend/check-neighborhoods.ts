import { prisma } from './src/config/prisma';
async function main() {
  const neighborhoods = await prisma.neighborhood.findMany();
  console.log('Total de bairros:', neighborhoods.length);
  console.log(JSON.stringify(neighborhoods, null, 2));
}
main().finally(() => prisma.$disconnect());
