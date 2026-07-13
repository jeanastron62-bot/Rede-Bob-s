"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADMIN_TECNICO_ID = void 0;
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const menuItems_1 = require("./seedData/menuItems");
const neighborhoods_1 = require("./seedData/neighborhoods");
const prisma = new client_1.PrismaClient();
exports.ADMIN_TECNICO_ID = 1; // fixando ID para segurança de exclusão futura
async function main() {
    console.log('Iniciando seed...');
    // 1. Criar usuário "tecnico" TI
    const password = await bcrypt_1.default.hash('admin123', 12);
    const user = await prisma.user.upsert({
        where: { username: 'tecnico' },
        update: {},
        create: {
            username: 'tecnico',
            password,
            role: 'TI',
            approved: true
        }
    });
    console.log('--- AVISO IMPORTANTE ---');
    console.log('Usuário "tecnico" criado com senha "admin123". ESTA SENHA DEVE SER TROCADA IMEDIATAMENTE EM PRODUÇÃO!');
    console.log('------------------------');
    // 2. Configuração do Sistema
    await prisma.systemConfig.upsert({
        where: { id: 1 },
        update: {},
        create: {
            contactPhone: "31986601345",
            contactInstagram: "Bebs.burguer",
            updatedBy: "seed"
        }
    });
    // 3. Cardápio (Phase 2)
    for (const item of menuItems_1.menuItems) {
        await prisma.menuItem.upsert({
            where: { name: item.name },
            update: {},
            create: {
                name: item.name,
                category: item.category,
                price: item.price,
                description: item.description || null,
                ingredients: item.ingredients || [],
                requiredChoice: item.requiredChoice || null,
                available: true,
                archived: false
            }
        });
    }
    // 4. Bairros (Phase 2)
    for (const neigh of neighborhoods_1.neighborhoods) {
        await prisma.neighborhood.upsert({
            where: { name: neigh.name },
            update: {},
            create: {
                name: neigh.name,
                deliveryFee: neigh.deliveryFee,
                active: true
            }
        });
    }
    console.log('Seed finalizado com sucesso.');
}
main()
    .catch(e => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
