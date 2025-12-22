import { customAlphabet } from 'nanoid';

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const generateRandom = customAlphabet(alphabet, 4);

export function generateMemberNumber() {
  const year = new Date().getFullYear();
  const random = generateRandom();
  return `ID-${year}-${random}`;
}
