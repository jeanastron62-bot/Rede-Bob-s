import { Prisma } from '@prisma/client';

export const sumDecimals = (...decimals: (Prisma.Decimal | string | number | undefined | null)[]): Prisma.Decimal => {
  return decimals.reduce((acc: Prisma.Decimal, curr) => {
    if (!curr) return acc;
    return acc.plus(new Prisma.Decimal(curr));
  }, new Prisma.Decimal(0));
};

export const multiplyDecimal = (val: Prisma.Decimal | string | number, multiplier: number): Prisma.Decimal => {
  return new Prisma.Decimal(val).times(multiplier);
};
