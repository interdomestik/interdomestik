import { statusEnum } from '@interdomestik/database/schema';

export type ClaimStatus = (typeof statusEnum.enumValues)[number];

export type ActionResult<T = void> = {
  success: boolean;
  error?: string;
  data?: T;
};
